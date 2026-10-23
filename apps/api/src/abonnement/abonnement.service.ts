import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@hotel-chicago/database";
import {
  DUREES_MOIS,
  etatAbonnement,
  finValidite,
  fonctionsAutorisees,
  formuleParCode,
  lignesFormule,
  masquerNumero,
  nouvelleFinValidite,
  numeroInternational,
  prixAbonnement,
  problemeNumero,
  type FormuleAbonnement,
} from "@hotel-chicago/regles";
import { lireCatalogue } from "../common/abonnement/catalogue";
import { formulesProposees } from "../common/abonnement/formules-proposees";
import { Role } from "@hotel-chicago/types";
import type { ApercuPaiement, DemandePaiementAbonnement, FormuleProposee, OperateurMobileMoney, PaiementAbonnementVue, UtilisateurAuthentifie, VueAbonnement } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { messages } from "../notifications/messages";
import { ErreurLinkPay, LinkPayClient, type ModeleCommission } from "./linkpay.client";

const MINUTE = 60_000;
/** Tant qu'une demande est en attente de confirmation sur le téléphone, un second paiement est refusé (évite de débiter deux fois par impatience). */
const DELAI_AVANT_NOUVEL_ESSAI_MS = 5 * MINUTE;
/** Passé ce délai sans réponse, la demande est abandonnée (le téléphone ne propose plus de la valider). */
const DELAI_ABANDON_MS = 24 * 60 * MINUTE;
const NOMBRE_HISTORIQUE = 12;

const pad = (n: number) => String(n).padStart(2, "0");
const dateFr = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;

@Injectable()
export class AbonnementService {
  private readonly logger = new Logger(AbonnementService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly linkpay: LinkPayClient,
    private readonly notifications: NotificationsService
  ) {}

  private async chargerHotel(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      include: { paiementsLicence: { where: { annuleLe: null }, orderBy: { periodeCouverteJusquau: "desc" }, take: 1, select: { periodeCouverteJusquau: true } } },
    });
    if (!hotel) throw new NotFoundException("Hôtel introuvable.");
    return hotel;
  }

  // ------------------------------------------------------------------------------------------------ lecture

  async vue(utilisateur: UtilisateurAuthentifie): Promise<VueAbonnement> {
    const hotel = await this.chargerHotel(utilisateur.hotelId);
    const catalogue = await lireCatalogue(this.prisma);
    const estPatron = utilisateur.role === Role.PATRON;
    const [nombreChambres, enCours, historique, manuels] = await Promise.all([
      this.prisma.chambre.count({ where: { hotelId: hotel.id } }),
      estPatron
        ? this.prisma.paiementAbonnement.findFirst({ where: { hotelId: hotel.id, statut: "EN_ATTENTE", createdAt: { gt: new Date(Date.now() - DELAI_ABANDON_MS) } }, orderBy: { createdAt: "desc" }, include: { paiementLicence: true } })
        : null,
      estPatron ? this.prisma.paiementAbonnement.findMany({ where: { hotelId: hotel.id }, orderBy: { createdAt: "desc" }, take: NOMBRE_HISTORIQUE, include: { paiementLicence: true } }) : [],
      estPatron ? this.prisma.paiementLicence.findMany({ where: { hotelId: hotel.id, paiementAbonnement: null, annuleLe: null }, orderBy: { createdAt: "desc" }, take: NOMBRE_HISTORIQUE }) : [],
    ]);
    const lignes = [
      ...historique.map((p) => this.versVue(p)),
      ...manuels.map(
        (m): PaiementAbonnementVue => ({
          id: m.id,
          formule: hotel.formule ?? "",
          mois: 0,
          montant: Number(m.montant),
          devise: m.devise,
          source: "SUPPORT",
          operateur: null,
          telephoneMasque: null,
          statut: "REUSSI",
          messageErreur: null,
          commission: null,
          total: null,
          periodeCouverteJusquau: m.periodeCouverteJusquau.toISOString(),
          createdAt: m.createdAt.toISOString(),
          confirmeLe: m.createdAt.toISOString(),
        })
      ),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, NOMBRE_HISTORIQUE);

    return {
      etat: etatAbonnement(hotel, hotel.paiementsLicence[0] ?? null, new Date(), catalogue.parametres),
      formuleActuelle: hotel.formule,
      nombreChambres,
      paiementEnLigne: this.linkpay.estConfigure(),
      fonctions: fonctionsAutorisees(hotel, hotel.paiementsLicence.length > 0, catalogue.formules, catalogue.parametres),
      contactSupport: { telephone: catalogue.parametres.contactTelephone, whatsapp: catalogue.parametres.contactWhatsapp },
      urlPaiementSite: `${(process.env.SITE_WEB_URL ?? "http://localhost:5175").replace(/\/+$/, "")}/payer`,
      formules: formulesProposees(catalogue),
      paiementEnCours: enCours ? this.versVue(enCours) : null,
      historique: lignes,
    };
  }

  private versVue(p: Prisma.PaiementAbonnementGetPayload<{ include: { paiementLicence: true } }>): PaiementAbonnementVue {
    return {
      id: p.id,
      formule: p.formule,
      mois: p.mois,
      montant: Number(p.montant),
      devise: p.devise,
      source: "EN_LIGNE",
      operateur: p.operateur,
      telephoneMasque: p.telephoneMasque,
      statut: p.statut,
      messageErreur: p.messageErreur,
      commission: p.commissionCentimes === null ? null : p.commissionCentimes / 100,
      total: p.totalCentimes === null ? null : p.totalCentimes / 100,
      periodeCouverteJusquau: p.paiementLicence?.periodeCouverteJusquau.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      confirmeLe: p.confirmeLe?.toISOString() ?? null,
    };
  }

  /** Le prix d'un achat et la commission ScanLinkPay qui s'y ajoute, AVANT de payer (rien n'est créé). */
  async apercu(utilisateur: UtilisateurAuthentifie, formuleCode: string, mois: number, devise: "USD" | "CDF"): Promise<ApercuPaiement> {
    const catalogue = await lireCatalogue(this.prisma);
    const formule = catalogue.proposees.includes(formuleCode) ? formuleParCode(formuleCode, catalogue.formules) : undefined;
    if (!formule || !(DUREES_MOIS as readonly number[]).includes(mois)) throw new BadRequestException("Formule ou durée inconnue.");
    const montant = prixAbonnement({ formule: formule.code, mois, devise, tauxCdf: catalogue.parametres.tauxCdf, formules: catalogue.formules, moisOffertsAnnuel: catalogue.parametres.moisOffertsAnnuel });
    const payeur = catalogue.parametres.fraisAbonnementPayesParClient;
    const base: ApercuPaiement = { devise, montant, commission: 0, total: montant, commissionPayeePar: payeur ? "PAYEUR" : "BENEFICIAIRE", disponible: false };
    const marchand = this.linkpay.marchandPlateforme();
    if (!marchand || !this.linkpay.estConfigure()) return base;
    try {
      const { frais } = await this.linkpay.apercuFrais({ marchand, montantCentimes: Math.round(montant * 100), devise, modele: payeur ? "CUSTOMER_PAID" : "MERCHANT_PAID" });
      return { ...base, commission: frais.commissionCentimes / 100, total: frais.totalCentimes / 100, disponible: true };
    } catch (e) {
      if (e instanceof ErreurLinkPay && e.statut === 404) this.logger.error("Aperçu des frais d'abonnement : ScanLinkPay ne connaît pas LINKPAY_NUMERO_MARCHAND — vérifiez ce numéro et LINKPAY_API_URL.");
      return base; // ScanLinkPay injoignable : on montre le prix seul, sans bloquer l'achat
    }
  }

  // ------------------------------------------------------------------------------------------------ paiement

  async creerPaiement(utilisateur: UtilisateurAuthentifie, dto: DemandePaiementAbonnement): Promise<PaiementAbonnementVue> {
    if (!this.linkpay.estConfigure()) {
      throw new ServiceUnavailableException("Le paiement en ligne n'est pas encore disponible. Contactez le support HotelSaver pour renouveler votre abonnement.");
    }
    const hotel = await this.chargerHotel(utilisateur.hotelId);
    const catalogue = await lireCatalogue(this.prisma);
    const etat = etatAbonnement(hotel, hotel.paiementsLicence[0] ?? null, new Date(), catalogue.parametres);
    if (!etat.renouvelable) throw new ForbiddenException("Cet hôtel ne peut pas renouveler en ligne. Contactez le support HotelSaver.");

    // Rejouer la même demande (coupure réseau, double clic) ne crée jamais un second débit : on renvoie la tentative d'origine.
    const existante = await this.prisma.paiementAbonnement.findUnique({ where: { cleIdempotence: dto.cleIdempotence } });
    if (existante) {
      if (existante.hotelId !== hotel.id) throw new ConflictException("Cette clé d'idempotence a déjà été utilisée pour une autre opération.");
      await this.rapprocher(existante.id);
      return this.vuePaiement(existante.id);
    }

    // Seules les formules encore proposées s'achètent (une formule retirée reste valable pour ceux qui l'ont déjà).
    const formule = catalogue.proposees.includes(dto.formule) ? formuleParCode(dto.formule, catalogue.formules) : undefined;
    if (!formule) throw new BadRequestException("Formule inconnue.");
    if (!(DUREES_MOIS as readonly number[]).includes(dto.mois)) throw new BadRequestException("Durée inconnue : choisissez 1, 3, 6 ou 12 mois.");
    const probleme = problemeNumero(dto.operateur, dto.telephone);
    if (probleme) throw new BadRequestException(probleme);
    const telephone = numeroInternational(dto.telephone)!;

    const nombreChambres = await this.prisma.chambre.count({ where: { hotelId: hotel.id } });
    if (formule.maxChambres !== null && nombreChambres > formule.maxChambres) {
      throw new BadRequestException(`Votre hôtel compte ${nombreChambres} chambres : la formule ${formule.nom} est limitée à ${formule.maxChambres}. Choisissez une formule supérieure.`);
    }

    const recent = await this.prisma.paiementAbonnement.findFirst({
      where: { hotelId: hotel.id, statut: "EN_ATTENTE", createdAt: { gt: new Date(Date.now() - DELAI_AVANT_NOUVEL_ESSAI_MS) } },
    });
    if (recent) {
      throw new ConflictException("Un paiement est déjà en attente de confirmation sur votre téléphone. Validez-le, ou patientez quelques minutes avant de réessayer.");
    }

    // Le montant vient UNIQUEMENT de la table des prix du serveur, jamais de l'application.
    const montant = prixAbonnement({ formule: formule.code, mois: dto.mois, devise: dto.devise, tauxCdf: catalogue.parametres.tauxCdf, formules: catalogue.formules, moisOffertsAnnuel: catalogue.parametres.moisOffertsAnnuel });
    if (!(montant > 0)) throw new BadRequestException("Montant invalide.");

    let ligne;
    try {
      ligne = await this.prisma.paiementAbonnement.create({
        data: {
          hotelId: hotel.id,
          utilisateurId: utilisateur.userId,
          formule: formule.code,
          mois: dto.mois,
          montant,
          devise: dto.devise,
          operateur: dto.operateur as OperateurMobileMoney,
          telephoneMasque: masquerNumero(telephone),
          cleIdempotence: dto.cleIdempotence,
        },
      });
    } catch (e) {
      // Deux envois simultanés de la même clé : le second retrouve la tentative du premier.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const autre = await this.prisma.paiementAbonnement.findUnique({ where: { cleIdempotence: dto.cleIdempotence } });
        if (autre && autre.hotelId === hotel.id) return this.vuePaiement(autre.id);
        throw new ConflictException("Cette clé d'idempotence a déjà été utilisée pour une autre opération.");
      }
      throw e;
    }

    try {
      // Commission ScanLinkPay : par défaut le patron la paie EN PLUS du prix (la plateforme reçoit le prix plein) ; réglable par le super-admin.
      const modele: ModeleCommission = catalogue.parametres.fraisAbonnementPayesParClient ? "CUSTOMER_PAID" : "MERCHANT_PAID";
      const demande = await this.linkpay.creerDemande({
        montantCentimes: Math.round(montant * 100),
        devise: dto.devise,
        modele,
        description: `Abonnement HotelSaver ${formule.nom} · ${dto.mois} mois — ${hotel.nom}`.slice(0, 200),
      });
      await this.prisma.paiementAbonnement.update({
        where: { id: ligne.id },
        data: { referenceDemande: demande.reference, modeleCommission: modele, commissionCentimes: demande.frais?.commissionCentimes ?? null, totalCentimes: demande.frais?.totalCentimes ?? null },
      });
      const lance = await this.lancerAvecReprise({ linkToken: demande.linkToken, cleIdempotence: ligne.id, telephone, operateur: dto.operateur as OperateurMobileMoney, nom: utilisateur.nom });
      await this.prisma.paiementAbonnement.update({ where: { id: ligne.id }, data: { referenceFournisseur: lance.referenceFournisseur } });
    } catch (e) {
      const erreur = e instanceof ErreurLinkPay ? e : new ErreurLinkPay(500, "Erreur inattendue.");
      const message = erreur.affichable
        ? erreur.message
        : erreur.statut === 0 || erreur.statut >= 500
          ? "Le service de paiement ne répond pas. Si une demande de confirmation arrive quand même sur votre téléphone, ne la validez pas : réessayez d'abord ici."
          : "Le paiement n'a pas pu être lancé. Réessayez dans un instant.";
      await this.prisma.paiementAbonnement.update({ where: { id: ligne.id }, data: { statut: "ECHEC", messageErreur: message } });
      if (!(e instanceof ErreurLinkPay)) this.logger.error(`Paiement d'abonnement ${ligne.id} : ${(e as Error).message}`);
      if (erreur.affichable) throw new BadRequestException(message);
      throw new ServiceUnavailableException(message);
    }
    return this.vuePaiement(ligne.id);
  }

  /** Relance l'envoi du paiement une fois si la réponse ne vient pas (même clé d'idempotence : ScanLinkPay renvoie alors le paiement déjà créé). */
  private async lancerAvecReprise(p: Parameters<LinkPayClient["lancerPaiement"]>[0]) {
    try {
      return await this.linkpay.lancerPaiement(p);
    } catch (e) {
      if (e instanceof ErreurLinkPay && (e.statut === 0 || e.statut >= 500)) {
        await new Promise((r) => setTimeout(r, 1500));
        return this.linkpay.lancerPaiement(p);
      }
      throw e;
    }
  }

  private async vuePaiement(id: string): Promise<PaiementAbonnementVue> {
    const p = await this.prisma.paiementAbonnement.findUniqueOrThrow({ where: { id }, include: { paiementLicence: true } });
    return this.versVue(p);
  }

  /** Lecture d'un paiement par le patron de l'hôtel (revérifie auprès de ScanLinkPay s'il est encore en attente). */
  async lirePaiement(utilisateur: UtilisateurAuthentifie, id: string) {
    const ligne = await this.prisma.paiementAbonnement.findUnique({ where: { id } });
    if (!ligne || ligne.hotelId !== utilisateur.hotelId) throw new NotFoundException("Paiement introuvable.");
    await this.rapprocher(id);
    const hotel = await this.chargerHotel(utilisateur.hotelId);
    const catalogue = await lireCatalogue(this.prisma);
    return { paiement: await this.vuePaiement(id), etat: etatAbonnement(hotel, hotel.paiementsLicence[0] ?? null, new Date(), catalogue.parametres) };
  }

  // ------------------------------------------------------------------------------------------------ rapprochement

  /**
   * Interroge ScanLinkPay sur une tentative en attente et en tire la conséquence : crédite l'hôtel si le paiement a réussi (bon montant,
   * bonne devise), marque l'échec s'il a échoué, abandonne après 24 h. Appelée par l'application pendant qu'elle attend ET par la tâche
   * planifiée : le résultat est identique, et le crédit ne peut avoir lieu qu'une fois (voir `crediter`).
   * `forcer` (support) permet de revérifier une tentative déjà classée en échec ou expirée.
   */
  async rapprocher(id: string, forcer = false): Promise<void> {
    const ligne = await this.prisma.paiementAbonnement.findUnique({ where: { id } });
    if (!ligne) return;
    const revérifiable = ligne.statut === "EN_ATTENTE" || (forcer && (ligne.statut === "ECHEC" || ligne.statut === "EXPIRE"));
    if (!revérifiable) return;

    const age = Date.now() - ligne.createdAt.getTime();
    if (!ligne.referenceFournisseur) {
      // Jamais parti chez ScanLinkPay (arrêt du serveur en plein envoi) : rien à attendre.
      if (age > 10 * MINUTE) await this.prisma.paiementAbonnement.update({ where: { id }, data: { statut: "ECHEC", messageErreur: "Le paiement n'a pas pu être lancé. Réessayez." } });
      return;
    }

    let statut;
    try {
      statut = await this.linkpay.lireStatut(ligne.referenceFournisseur);
    } catch {
      return; // ScanLinkPay injoignable : on réessaiera.
    }
    await this.prisma.paiementAbonnement.update({ where: { id }, data: { derniereVerificationLe: new Date() } });

    if (statut.statut === "SUCCESS") {
      const attendu = Math.round(Number(ligne.montant) * 100);
      if (statut.montantCentimes !== attendu || statut.devise !== ligne.devise) {
        this.logger.error(`ALERTE paiement d'abonnement ${id} : ScanLinkPay annonce ${statut.montantCentimes} ${statut.devise}, attendu ${attendu} ${ligne.devise}. Non crédité.`);
        await this.prisma.paiementAbonnement.update({ where: { id }, data: { statut: "ECHEC", messageErreur: "Le montant reçu ne correspond pas à l'abonnement choisi. Contactez le support HotelSaver avec la référence du paiement." } });
        return;
      }
      await this.crediter(ligne.id);
    } else if (statut.statut === "FAILED") {
      if (ligne.statut === "EN_ATTENTE") {
        await this.prisma.paiementAbonnement.update({ where: { id }, data: { statut: "ECHEC", messageErreur: "Le paiement a été refusé ou annulé sur le téléphone." } });
      }
    } else if (ligne.statut === "EN_ATTENTE" && age > DELAI_ABANDON_MS) {
      await this.prisma.paiementAbonnement.update({ where: { id }, data: { statut: "EXPIRE", messageErreur: "Aucune confirmation reçue : la demande a expiré." } });
    }
  }

  /** Tâche planifiée : rapproche toutes les tentatives encore en attente. */
  async rapprocherEnAttente(): Promise<number> {
    if (!this.linkpay.estConfigure()) return 0;
    const enAttente = await this.prisma.paiementAbonnement.findMany({ where: { statut: "EN_ATTENTE" }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 100 });
    for (const { id } of enAttente) {
      try {
        await this.rapprocher(id);
      } catch (e) {
        this.logger.error(`Rapprochement du paiement ${id} : ${(e as Error).message}`);
      }
    }
    return enAttente.length;
  }

  /**
   * Crédite l'hôtel : une ligne PaiementLicence (l'échéance se déduit toujours de la dernière) et la formule. Le « verrou » est la
   * transition atomique vers REUSSI : si l'application et la tâche planifiée rapprochent en même temps, une seule passe et l'autre
   * constate `count = 0` — jamais deux périodes pour un seul paiement.
   */
  private async crediter(id: string): Promise<void> {
    const maintenant = new Date();
    const resultat = await this.prisma.$transaction(async (tx) => {
      const prise = await tx.paiementAbonnement.updateMany({
        where: { id, statut: { in: ["EN_ATTENTE", "ECHEC", "EXPIRE"] } },
        data: { statut: "REUSSI", confirmeLe: maintenant, messageErreur: null },
      });
      if (prise.count === 0) return null;
      const ligne = await tx.paiementAbonnement.findUniqueOrThrow({ where: { id } });
      const hotel = await tx.hotel.findUniqueOrThrow({
        where: { id: ligne.hotelId },
        include: { paiementsLicence: { where: { annuleLe: null }, orderBy: { periodeCouverteJusquau: "desc" }, take: 1, select: { periodeCouverteJusquau: true } } },
      });
      const catalogue = await lireCatalogue(this.prisma);
      const fin = nouvelleFinValidite(finValidite(hotel, hotel.paiementsLicence[0] ?? null, catalogue.parametres.joursEssai), maintenant, ligne.mois);
      const nom = formuleParCode(ligne.formule, catalogue.formules)?.nom ?? ligne.formule;
      const licence = await tx.paiementLicence.create({
        data: {
          hotelId: hotel.id,
          montant: ligne.montant,
          devise: ligne.devise,
          methode: "MOBILE_MONEY",
          periodeCouverteJusquau: fin,
          note: `Abonnement ${nom} · ${ligne.mois} mois · payé dans l'application (${ligne.operateur}, réf. ${ligne.referenceDemande ?? ligne.referenceFournisseur ?? ligne.id})`,
        },
      });
      await tx.paiementAbonnement.update({ where: { id }, data: { paiementLicenceId: licence.id } });
      // Un hôtel suspendu À LA MAIN par le support ne se rouvre pas en payant : il reçoit son crédit mais reste suspendu.
      await tx.hotel.update({ where: { id: hotel.id }, data: { formule: ligne.formule, ...(hotel.suspensionManuelle ? {} : { statutLicence: "ACTIF" }) } });
      return { hotelId: hotel.id, fin, nom };
    });
    if (!resultat) return;
    this.logger.log(`Abonnement crédité : hôtel ${resultat.hotelId} jusqu'au ${resultat.fin.toISOString()}`);
    void this.notifications.emettre({
      hotelId: resultat.hotelId,
      roles: [Role.PATRON],
      cleDedup: `abonnement-renouvele:${id}`,
      ...messages.abonnementRenouvele({ jusquau: dateFr(resultat.fin), formule: resultat.nom }),
    });
  }

  // ------------------------------------------------------------------------------------------------ support (super-admin)

  async listerPourSupport(limite = 100) {
    const lignes = await this.prisma.paiementAbonnement.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limite, 1), 200),
      include: { hotel: { select: { nom: true, sousDomaine: true } }, paiementLicence: true },
    });
    return lignes.map((l) => ({ ...this.versVue(l), hotelId: l.hotelId, hotelNom: l.hotel.nom, sousDomaine: l.hotel.sousDomaine, referenceDemande: l.referenceDemande, referenceFournisseur: l.referenceFournisseur }));
  }

  async reverifierPourSupport(id: string): Promise<PaiementAbonnementVue> {
    const ligne = await this.prisma.paiementAbonnement.findUnique({ where: { id } });
    if (!ligne) throw new NotFoundException("Paiement introuvable.");
    await this.rapprocher(id, true);
    return this.vuePaiement(id);
  }
}
