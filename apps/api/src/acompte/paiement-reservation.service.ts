import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@hotel-chicago/database";
import { fonctionsAutorisees, masquerNumero, numeroInternational, problemeNumero } from "@hotel-chicago/regles";
import { Role } from "@hotel-chicago/types";
import type { AcompteEnLigne, AcompteEnLignePersonnel, ApercuPaiement, PaiementReservationVue, RemboursementClientVue } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { lireCatalogue } from "../common/abonnement/catalogue";
import { NotificationsService } from "../notifications/notifications.service";
import { messages } from "../notifications/messages";
import { estViolationChevauchement } from "../common/chevauchement";
import { ErreurLinkPay, LinkPayClient, type FraisPaiement, type ModeleCommission } from "../abonnement/linkpay.client";
import { depuisCentimes, nombreDeNuits, objectifAcompte, resteAPayer, versCentimes } from "./calcul-acompte";
import { MESSAGE_CHAMBRE_EN_COURS, MESSAGE_CHAMBRE_RESERVEE, chambresPrises, verrouillerChambre } from "../common/disponibilite-chambre";
import { RemboursementsService } from "./remboursements.service";
import { urlScanLinkPay } from "./reglages-paiement.service";
import type { PayerAcompteDto } from "./dto/paiement-reservation.dto";

const MINUTE = 60_000;
const DELAI_NOUVEL_ESSAI_MS = 5 * MINUTE;
const DELAI_ABANDON_MS = 24 * 60 * MINUTE;

type Hotel = Prisma.HotelGetPayload<object>;
type ReservationComplete = Prisma.ReservationGetPayload<{ include: { chambre: true; client: true } }>;

const fmt = (m: number, devise: "USD" | "CDF") => (devise === "USD" ? `${m.toLocaleString("fr-FR", { minimumFractionDigits: Number.isInteger(m) ? 0 : 2 })} $` : `${Math.round(m).toLocaleString("fr-FR")} FC`);

/**
 * L'acompte de réservation payé EN LIGNE par le client, sur le site de l'hôtel : Mobile Money (M-Pesa, Airtel, Orange, Africell) ou carte
 * (Visa, Mastercard) via ScanLinkPay, directement sur le compte marchand de l'HÔTEL. Mêmes garde-fous que l'abonnement : montant calculé par le
 * serveur (pourcentage du patron × séjour), crédit seulement si ScanLinkPay confirme le bon montant, une seule fois, idempotent.
 */
@Injectable()
export class PaiementReservationService {
  private readonly logger = new Logger(PaiementReservationService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly linkpay: LinkPayClient,
    private readonly notifications: NotificationsService,
    private readonly remboursements: RemboursementsService
  ) {}

  private carteAutorisee(): boolean {
    return (process.env.ACOMPTE_CARTE ?? "true").trim().toLowerCase() !== "false";
  }

  private modele(hotel: Hotel): ModeleCommission {
    return hotel.acompteFraisPayesParClient ? "CUSTOMER_PAID" : "MERCHANT_PAID";
  }

  private async fonctionsDe(hotel: Hotel) {
    const catalogue = await lireCatalogue(this.prisma);
    const aPaye = (await this.prisma.paiementLicence.count({ where: { hotelId: hotel.id, annuleLe: null } })) > 0;
    return fonctionsAutorisees(hotel, aPaye, catalogue.formules, catalogue.parametres);
  }

  /** Le paiement en ligne est-il proposé par cet hôtel ? (formule, compte ScanLinkPay, pourcentage, serveur relié) */
  private async propose(hotel: Hotel): Promise<boolean> {
    return (
      hotel.pourcentageAcompte > 0 &&
      Boolean(hotel.numeroScanLinkPay) &&
      this.linkpay.adresseConfiguree() &&
      (await this.fonctionsDe(hotel)).includes("ACOMPTE_EN_LIGNE")
    );
  }

  private marchand(hotel: Hotel) {
    return { numero: hotel.numeroScanLinkPay!, boutiqueId: hotel.boutiqueScanLinkPayId };
  }

  private versVue(p: Prisma.PaiementReservationGetPayload<object>): PaiementReservationVue {
    return {
      id: p.id,
      montant: Number(p.montant),
      devise: p.devise,
      moyen: p.moyen,
      operateur: p.operateur,
      telephoneMasque: p.telephoneMasque,
      statut: p.statut,
      messageErreur: p.messageErreur,
      commission: depuisCentimes(p.commissionCentimes),
      total: depuisCentimes(p.totalCentimes),
      urlPaiement: p.statut === "EN_ATTENTE" ? p.urlPaiement : null,
      createdAt: p.createdAt.toISOString(),
      confirmeLe: p.confirmeLe?.toISOString() ?? null,
    };
  }

  // ------------------------------------------------------------------------------------------------ ce que voit le client

  /** Le bloc « acompte en ligne » de la page « Ma réservation » ; null si l'hôtel n'a pas ce service. */
  async presenter(hotel: Hotel, reservation: ReservationComplete): Promise<AcompteEnLigne | null> {
    if (!(await this.propose(hotel))) return null;
    const devise = reservation.chambre.devise as "USD" | "CDF";
    const nuits = nombreDeNuits(reservation.dateArrivee, reservation.dateDepart);
    const objectif = objectifAcompte({ prixParNuit: Number(reservation.chambre.prixParNuit), nuits, pourcentage: hotel.pourcentageAcompte, devise });
    const dejaPaye = Number(reservation.acompte);
    const reste = resteAPayer(objectif, dejaPaye, devise);
    const paiements = await this.prisma.paiementReservation.findMany({ where: { reservationId: reservation.id }, orderBy: { createdAt: "desc" }, take: 10 });
    const enCours = paiements.find((p) => p.statut === "EN_ATTENTE" && Date.now() - p.createdAt.getTime() < DELAI_ABANDON_MS) ?? null;

    let indisponibleRaison: string | null = null;
    if (reservation.statut !== "EN_ATTENTE" && reservation.statut !== "CONFIRMEE") indisponibleRaison = "Cette réservation n'est plus active.";
    else if (Date.now() > reservation.dateArrivee.getTime() + 24 * 3600_000) indisponibleRaison = "La date d'arrivée est passée.";
    else if (objectif <= 0) indisponibleRaison = "Aucun acompte n'est demandé pour cette réservation.";
    else if (reste <= 0) indisponibleRaison = "L'acompte est déjà payé. Merci !";
    else if (reservation.statut === "EN_ATTENTE") {
      // Une autre personne a déjà confirmé (ou est en train de payer) cette chambre pour ces dates : on le dit AVANT de payer, pas après.
      const prise = (await chambresPrises(this.prisma, { hotelId: reservation.hotelId, debut: reservation.dateArrivee, fin: reservation.dateDepart, chambreId: reservation.chambreId, exclureReservationId: reservation.id })).get(reservation.chambreId);
      if (prise) indisponibleRaison = prise.etat === "RESERVEE" ? "Cette chambre vient d'être réservée par un autre client pour ces dates. L'hôtel va vous contacter pour vous proposer une autre chambre ou d'autres dates." : MESSAGE_CHAMBRE_EN_COURS;
    }

    const remboursement = await this.prisma.remboursement.findFirst({ where: { reservationId: reservation.id }, orderBy: { createdAt: "desc" } });
    const remboursementVue: RemboursementClientVue | null = remboursement
      ? {
          statut: remboursement.statut === "A_FAIRE" ? "EN_COURS" : remboursement.statut,
          montant: Number(remboursement.statut === "EFFECTUE" ? remboursement.montantARembourser : remboursement.montantPaye),
          devise: remboursement.devise,
          mode: remboursement.mode,
          le: remboursement.traiteLe?.toISOString() ?? null,
        }
      : null;

    return {
      disponible: indisponibleRaison === null,
      indisponibleRaison,
      pourcentage: hotel.pourcentageAcompte,
      devise,
      objectif,
      dejaPaye,
      reste,
      moyens: { mobileMoney: true, carte: this.carteAutorisee() },
      fraisPayesParClient: hotel.acompteFraisPayesParClient,
      nomMarchand: hotel.nomScanLinkPay,
      conditionsAnnulation: hotel.conditionsAnnulation,
      paiementEnCours: enCours ? this.versVue(enCours) : null,
      paiements: paiements.map((p) => this.versVue(p)),
      remboursement: remboursementVue,
      urlScanLinkPay: urlScanLinkPay(),
    };
  }

  /** Les frais de l'acompte restant, AVANT de payer : ce que le client verra débité. */
  async apercu(hotel: Hotel, reservation: ReservationComplete): Promise<ApercuPaiement> {
    const montant = await this.montantRestant(hotel, reservation);
    const devise = reservation.chambre.devise as "USD" | "CDF";
    const modele = this.modele(hotel);
    const base: ApercuPaiement = { devise, montant, commission: 0, total: montant, commissionPayeePar: hotel.acompteFraisPayesParClient ? "PAYEUR" : "BENEFICIAIRE", disponible: false };
    try {
      const { frais } = await this.linkpay.apercuFrais({ marchand: this.marchand(hotel), montantCentimes: versCentimes(montant), devise, modele });
      return { ...base, commission: (frais.commissionCentimes) / 100, total: frais.totalCentimes / 100, disponible: true };
    } catch {
      return base;
    }
  }

  private async montantRestant(hotel: Hotel, reservation: ReservationComplete): Promise<number> {
    if (!(await this.propose(hotel))) throw new NotFoundException("Le paiement en ligne n'est pas proposé par cet hôtel.");
    const devise = reservation.chambre.devise as "USD" | "CDF";
    const nuits = nombreDeNuits(reservation.dateArrivee, reservation.dateDepart);
    const objectif = objectifAcompte({ prixParNuit: Number(reservation.chambre.prixParNuit), nuits, pourcentage: hotel.pourcentageAcompte, devise });
    const reste = resteAPayer(objectif, Number(reservation.acompte), devise);
    if (reste <= 0) throw new ConflictException("L'acompte de cette réservation est déjà payé.");
    return reste;
  }

  // ------------------------------------------------------------------------------------------------ payer

  async creerPaiement(hotel: Hotel, reservation: ReservationComplete, dto: PayerAcompteDto): Promise<PaiementReservationVue> {
    const existante = await this.prisma.paiementReservation.findUnique({ where: { cleIdempotence: dto.cleIdempotence } });
    if (existante) {
      if (existante.reservationId !== reservation.id) throw new ConflictException("Cette clé d'idempotence a déjà été utilisée pour une autre opération.");
      await this.rapprocher(existante.id);
      return this.vuePaiement(existante.id);
    }

    if (reservation.statut !== "EN_ATTENTE" && reservation.statut !== "CONFIRMEE") throw new ConflictException("Cette réservation n'est plus active.");
    if (Date.now() > reservation.dateArrivee.getTime() + 24 * 3600_000) throw new ConflictException("La date d'arrivée est passée.");
    const montant = await this.montantRestant(hotel, reservation);
    const devise = reservation.chambre.devise as "USD" | "CDF";

    if (dto.moyen === "CARTE" && !this.carteAutorisee()) throw new BadRequestException("Le paiement par carte n'est pas disponible pour le moment. Utilisez Mobile Money.");
    let telephone: string | undefined;
    if (dto.moyen === "MOBILE_MONEY") {
      if (!dto.operateur) throw new BadRequestException("Choisissez votre opérateur Mobile Money.");
      const probleme = problemeNumero(dto.operateur, dto.telephone);
      if (probleme) throw new BadRequestException(probleme);
      telephone = numeroInternational(dto.telephone)!;
    }

    const modele = this.modele(hotel);
    let ligne;
    try {
      // Sous verrou « chambre » : la vérification (déjà prise ? retenue par un autre client ?) et l'enregistrement du paiement se font dans le même
      // bloc indivisible. Deux clients qui paient à la même seconde passent l'un après l'autre : le second voit la retenue du premier et est refusé
      // AVANT d'être débité. Plus aucune course possible entre deux paiements.
      ligne = await this.prisma.$transaction(async (tx) => {
        await verrouillerChambre(tx, reservation.chambreId);
        const prise = (await chambresPrises(tx as unknown as PrismaClient, { hotelId: hotel.id, debut: reservation.dateArrivee, fin: reservation.dateDepart, chambreId: reservation.chambreId, exclureReservationId: reservation.id })).get(reservation.chambreId);
        if (prise) throw new ConflictException(prise.etat === "RESERVEE" ? MESSAGE_CHAMBRE_RESERVEE : MESSAGE_CHAMBRE_EN_COURS);

        const recent = await tx.paiementReservation.findFirst({ where: { reservationId: reservation.id, statut: "EN_ATTENTE", createdAt: { gt: new Date(Date.now() - DELAI_NOUVEL_ESSAI_MS) } } });
        if (recent) throw new ConflictException("Un paiement est déjà en attente de confirmation. Validez-le sur votre téléphone, ou patientez quelques minutes avant de réessayer.");

        return tx.paiementReservation.create({
          data: {
            hotelId: hotel.id,
            reservationId: reservation.id,
            montant,
            devise,
            pourcentage: hotel.pourcentageAcompte,
            moyen: dto.moyen,
            operateur: dto.moyen === "MOBILE_MONEY" ? dto.operateur : null,
            telephoneMasque: telephone ? masquerNumero(telephone) : null,
            modeleCommission: modele,
            cleIdempotence: dto.cleIdempotence,
            numeroScanLinkPayClient: dto.numeroScanLinkPay?.trim() || null,
          },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const autre = await this.prisma.paiementReservation.findUnique({ where: { cleIdempotence: dto.cleIdempotence } });
        if (autre && autre.reservationId === reservation.id) return this.vuePaiement(autre.id);
        throw new ConflictException("Cette clé d'idempotence a déjà été utilisée pour une autre opération.");
      }
      throw e;
    }

    try {
      const demande = await this.linkpay.creerDemande({
        marchand: this.marchand(hotel),
        montantCentimes: versCentimes(montant),
        devise,
        modele,
        description: `Acompte réservation ${reservation.jetonSuivi.slice(0, 8).toUpperCase()} — ${reservation.client.nom} — ${hotel.nom}`.slice(0, 200),
        expireMinutes: 60,
      });
      const lance = await this.lancerAvecReprise({
        linkToken: demande.linkToken,
        cleIdempotence: ligne.id,
        moyen: dto.moyen === "CARTE" ? "card" : "mobile_money",
        telephone,
        operateur: dto.operateur,
        nom: reservation.client.nom,
        email: dto.email ?? reservation.client.email ?? undefined,
      });
      await this.prisma.paiementReservation.update({
        where: { id: ligne.id },
        data: {
          referenceDemande: demande.reference,
          referenceFournisseur: lance.referenceFournisseur,
          urlPaiement: lance.urlPaiement,
          commissionCentimes: demande.frais?.commissionCentimes ?? null,
          totalCentimes: lance.totalCentimes ?? demande.frais?.totalCentimes ?? null,
        },
      });
    } catch (e) {
      const erreur = e instanceof ErreurLinkPay ? e : new ErreurLinkPay(500, "Erreur inattendue.");
      const message = erreur.affichable
        ? erreur.message
        : erreur.statut === 0 || erreur.statut >= 500
          ? "Le service de paiement ne répond pas. Si une demande de confirmation arrive quand même sur votre téléphone, ne la validez pas : réessayez d'abord ici."
          : "Le paiement n'a pas pu être lancé. Réessayez dans un instant.";
      await this.prisma.paiementReservation.update({ where: { id: ligne.id }, data: { statut: "ECHEC", messageErreur: message } });
      if (!(e instanceof ErreurLinkPay)) this.logger.error(`Acompte ${ligne.id} : ${(e as Error).message}`);
      if (erreur.affichable) throw new BadRequestException(message);
      throw new ServiceUnavailableException(message);
    }
    return this.vuePaiement(ligne.id);
  }

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

  private async vuePaiement(id: string): Promise<PaiementReservationVue> {
    return this.versVue(await this.prisma.paiementReservation.findUniqueOrThrow({ where: { id } }));
  }

  /** Le client revient sur sa page : état du paiement, revérifié auprès de ScanLinkPay s'il est encore en attente. */
  async lirePaiement(reservationId: string, id: string): Promise<PaiementReservationVue> {
    const ligne = await this.prisma.paiementReservation.findUnique({ where: { id } });
    if (!ligne || ligne.reservationId !== reservationId) throw new NotFoundException("Paiement introuvable.");
    await this.rapprocher(id);
    return this.vuePaiement(id);
  }

  // ------------------------------------------------------------------------------------------------ rapprochement

  async rapprocher(id: string): Promise<void> {
    const ligne = await this.prisma.paiementReservation.findUnique({ where: { id } });
    if (!ligne || ligne.statut !== "EN_ATTENTE") return;
    const age = Date.now() - ligne.createdAt.getTime();
    if (!ligne.referenceFournisseur) {
      if (age > 10 * MINUTE) await this.prisma.paiementReservation.update({ where: { id }, data: { statut: "ECHEC", messageErreur: "Le paiement n'a pas pu être lancé. Réessayez." } });
      return;
    }
    let statut;
    try {
      statut = await this.linkpay.lireStatut(ligne.referenceFournisseur);
    } catch {
      return;
    }
    await this.prisma.paiementReservation.update({ where: { id }, data: { derniereVerificationLe: new Date() } });
    if (statut.statut === "SUCCESS") {
      const attendu = versCentimes(Number(ligne.montant));
      if (statut.montantCentimes !== attendu || statut.devise !== ligne.devise) {
        this.logger.error(`ALERTE acompte ${id} : ScanLinkPay annonce ${statut.montantCentimes} ${statut.devise}, attendu ${attendu} ${ligne.devise}. Non crédité.`);
        await this.prisma.paiementReservation.update({ where: { id }, data: { statut: "ECHEC", messageErreur: "Le montant reçu ne correspond pas à l'acompte demandé. Contactez l'hôtel avec la référence de votre paiement." } });
        return;
      }
      await this.crediter(id);
    } else if (statut.statut === "FAILED") {
      await this.prisma.paiementReservation.update({ where: { id }, data: { statut: "ECHEC", messageErreur: ligne.moyen === "CARTE" ? "Le paiement par carte a été refusé ou annulé." : "Le paiement a été refusé ou annulé sur le téléphone." } });
    } else if (age > DELAI_ABANDON_MS) {
      await this.prisma.paiementReservation.update({ where: { id }, data: { statut: "EXPIRE", messageErreur: "Aucune confirmation reçue : la demande a expiré." } });
    }
  }

  async rapprocherEnAttente(): Promise<number> {
    if (!this.linkpay.adresseConfiguree()) return 0;
    const lignes = await this.prisma.paiementReservation.findMany({ where: { statut: "EN_ATTENTE" }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 100 });
    for (const { id } of lignes) {
      try {
        await this.rapprocher(id);
      } catch (e) {
        this.logger.error(`Rapprochement de l'acompte ${id} : ${(e as Error).message}`);
      }
    }
    return lignes.length;
  }

  /**
   * Crédite la réservation : acompte + confirmation. Une seule fois (transition atomique vers REUSSI). La confirmation se tente APRÈS la
   * transaction : si la chambre a été prise entre-temps, la contrainte de la base la refuse — la réservation est alors annulée et l'acompte
   * placé dans les remboursements, jamais gardé en silence.
   */
  private async crediter(id: string): Promise<void> {
    const maintenant = new Date();
    const prise = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.paiementReservation.updateMany({ where: { id, statut: "EN_ATTENTE" }, data: { statut: "REUSSI", confirmeLe: maintenant, messageErreur: null } });
      if (claim.count === 0) return null;
      const ligne = await tx.paiementReservation.findUniqueOrThrow({ where: { id } });
      await tx.reservation.update({ where: { id: ligne.reservationId }, data: { acompte: { increment: ligne.montant }, syncVersion: { increment: 1 } } });
      return ligne;
    });
    if (!prise) return;

    let confirmee = false;
    const reservation = await this.prisma.reservation.findUniqueOrThrow({ where: { id: prise.reservationId }, include: { chambre: true, client: true } });
    if (reservation.statut === "CONFIRMEE") confirmee = true;
    else if (reservation.statut === "EN_ATTENTE") {
      try {
        await this.prisma.reservation.update({ where: { id: reservation.id }, data: { statut: "CONFIRMEE", syncVersion: { increment: 1 } } });
        confirmee = true;
      } catch (e) {
        if (!estViolationChevauchement(e)) throw e;
        await this.prisma.reservation.update({
          where: { id: reservation.id },
          data: { statut: "ANNULEE", annuleLe: new Date(), motifAnnulation: "Chambre devenue indisponible pendant le paiement de l'acompte", syncVersion: { increment: 1 } },
        });
        await this.remboursements.creerSiAcompteEnLigne(reservation.id, "CHAMBRE_INDISPONIBLE");
      }
    }
    void this.notifications.emettre({
      hotelId: prise.hotelId,
      roles: [Role.RECEPTIONNISTE, Role.PATRON],
      cleDedup: `acompte-en-ligne:${id}`,
      ...messages.acomptePayeEnLigne({ client: reservation.client.nom, chambre: reservation.chambre.numero, montant: fmt(Number(prise.montant), prise.devise), reservationId: reservation.id, confirmee }),
    });
  }

  /**
   * Pour la réception et le patron : les acomptes PAYÉS en ligne des réservations récentes (départ il y a moins de 45 jours ou à venir), afin que
   * les listes affichent « Payé en ligne » et que le détail dise comment, quand, et avec quelle référence. Seuls les paiements confirmés (REUSSI).
   */
  async acomptesPayesEnLigne(hotelId: string): Promise<AcompteEnLignePersonnel[]> {
    const depuis = new Date(Date.now() - 45 * 24 * 60 * MINUTE);
    const reservations = await this.prisma.reservation.findMany({ where: { hotelId, dateDepart: { gte: depuis } }, select: { id: true } });
    if (reservations.length === 0) return [];
    const paiements = await this.prisma.paiementReservation.findMany({
      where: { hotelId, statut: "REUSSI", reservationId: { in: reservations.map((r) => r.id) } },
      orderBy: { confirmeLe: "desc" },
      include: { remboursements: { select: { statut: true } } },
    });
    return paiements.map((p) => ({
      paiementId: p.id,
      reservationId: p.reservationId,
      montant: Number(p.montant),
      devise: p.devise as "USD" | "CDF",
      moyen: p.moyen,
      operateur: p.operateur,
      telephoneMasque: p.telephoneMasque,
      reference: p.referenceDemande ?? p.referenceFournisseur,
      confirmeLe: p.confirmeLe ? p.confirmeLe.toISOString() : null,
      remboursement: (p.remboursements[0]?.statut ?? null) as AcompteEnLignePersonnel["remboursement"],
    }));
  }
}
