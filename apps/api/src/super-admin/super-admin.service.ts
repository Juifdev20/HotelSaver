import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@hotel-chicago/database";
import { Role } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { messages } from "../notifications/messages";
import { CreerHotelDto } from "./dto/creer-hotel.dto";
import { ChangerStatutHotelDto } from "./dto/changer-statut-hotel.dto";
import { EnregistrerPaiementDto } from "./dto/enregistrer-paiement.dto";
import { AnnulerPaiementDto } from "./dto/annuler-paiement.dto";
import { AjouterDomaineDto } from "./dto/ajouter-domaine.dto";
import { extraireCouleursLogo } from "../common/palette/extraire-couleurs-logo";
import { genererPalette } from "../common/palette/generer-palette";
import { etatAbonnement, fonctionsAutorisees } from "@hotel-chicago/regles";
import { lireCatalogue } from "../common/abonnement/catalogue";
import { calculerFinValidite } from "./calculer-validite";
import { RenderDomainsService } from "./render-domains.service";

@Injectable()
export class SuperAdminService {
  private readonly logger = new Logger(SuperAdminService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly renderDomains: RenderDomainsService,
    private readonly notifications: NotificationsService
  ) {}

  /** Chaque hôtel gagne `valideJusquau` (Phase 12), calculé à partir de son
   * dernier paiement — jamais stocké, voir calculer-validite.ts. */
  async findAllHotels() {
    const hotels = await this.prisma.hotel.findMany({
      include: {
        branding: true,
        paiementsLicence: { where: { annuleLe: null }, orderBy: { periodeCouverteJusquau: "desc" }, take: 1 },
        _count: { select: { chambres: true } },
        // Patron : son numéro de connexion s'affiche dans la liste (15/10/2026).
        utilisateurs: { where: { role: "PATRON" }, select: { nom: true, telephone: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    return hotels.map(({ paiementsLicence, utilisateurs, _count, ...hotel }) => ({
      ...hotel,
      nombreChambres: _count?.chambres ?? 0,
      patron: utilisateurs?.[0] ?? null,
      valideJusquau: calculerFinValidite(hotel, paiementsLicence[0] ?? null),
    }));
  }

  /** Le compte PATRON d'un hôtel (le plus ancien s'il y en a plusieurs). */
  async trouverPatron(hotelId: string) {
    const patron = await this.prisma.utilisateur.findFirst({
      where: { hotelId, role: "PATRON" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!patron) throw new NotFoundException("Cet hôtel n'a pas de compte patron.");
    return patron;
  }

  /**
   * Onboarding manuel — jamais le formulaire public (POST /public/hotels/inscription,
   * hors scope de cette phase) : statutLicence = ACTIF directement, pas ESSAI.
   * Crée la HotelBranding dans la même opération : un hôtel sans charte
   * graphique ne serait pas exploitable côté mobile/desktop/web. Si un logo
   * est fourni, la palette en est dérivée (Phase 5) ; sinon PALETTE_DEFAUT.
   */
  async creerHotel(dto: CreerHotelDto) {
    const couleurBase = dto.logoUrl ? await extraireCouleursLogo(dto.logoUrl) : null;
    const palette = genererPalette(couleurBase);

    try {
      return await this.prisma.hotel.create({
        data: {
          nom: dto.nom,
          sousDomaine: dto.sousDomaine,
          statutLicence: "ACTIF",
          emailContact: dto.emailContact,
          telephoneContact: dto.telephoneContact,
          adresse: dto.adresse,
          branding: { create: { palette, logoUrl: dto.logoUrl } },
        },
        include: { branding: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(`Un hôtel avec le sous-domaine "${dto.sousDomaine}" existe déjà.`);
      }
      throw error;
    }
  }

  async changerStatut(id: string, dto: ChangerStatutHotelDto) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id } });
    if (!hotel) {
      throw new NotFoundException(`Aucun hôtel trouvé avec l'identifiant ${id}.`);
    }
    // SUSPENDU posé à la main = l'hôtel ne peut pas se rouvrir seul en payant en ligne ; tout autre statut efface cette marque.
    return this.prisma.hotel.update({ where: { id }, data: { statutLicence: dto.statutLicence, suspensionManuelle: dto.statutLicence === "SUSPENDU" } });
  }

  /**
   * Enregistrer un paiement réactive TOUJOURS l'hôtel (ESSAI/SUSPENDU/RESILIE
   * → ACTIF) : un client qui revient après résiliation doit pouvoir repartir
   * en payant, pas rester bloqué (décision du patron, Phase 12).
   */
  async enregistrerPaiement(hotelId: string, dto: EnregistrerPaiementDto, superAdminId: string) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) {
      throw new NotFoundException(`Aucun hôtel trouvé avec l'identifiant ${hotelId}.`);
    }

    const [paiement] = await this.prisma.$transaction([
      this.prisma.paiementLicence.create({
        data: {
          hotelId,
          montant: dto.montant,
          devise: dto.devise,
          methode: dto.methode,
          periodeCouverteJusquau: new Date(dto.periodeCouverteJusquau),
          note: dto.note,
          enregistreParSuperAdminId: superAdminId,
        },
      }),
      this.prisma.hotel.update({ where: { id: hotelId }, data: { statutLicence: "ACTIF", suspensionManuelle: false } }),
    ]);

    return paiement;
  }

  /** Tous les paiements d'un hôtel (les plus récents d'abord), annulés compris : l'écran du super-admin montre la trace complète. */
  async listerPaiements(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true } });
    if (!hotel) throw new NotFoundException(`Aucun hôtel trouvé avec l'identifiant ${hotelId}.`);
    const lignes = await this.prisma.paiementLicence.findMany({
      where: { hotelId },
      orderBy: { createdAt: "desc" },
      include: { paiementAbonnement: { select: { id: true } }, enregistrePar: { select: { nom: true } } },
    });
    return lignes.map(({ paiementAbonnement, enregistrePar, ...p }) => ({
      ...p,
      montant: Number(p.montant),
      source: paiementAbonnement ? ("EN_LIGNE" as const) : ("MANUEL" as const),
      enregistreParNom: enregistrePar?.nom ?? null,
    }));
  }

  /**
   * Annule un paiement SAISI À LA MAIN (17/10/2026) — erreur de saisie, test. La ligne n'est jamais effacée (traçabilité) : marquée
   * annulée avec son motif, elle ne compte plus nulle part (validité, accès, statut, fonctions, historique du patron). Un paiement en
   * ligne réel (Mobile Money via ScanLinkPay) ne s'annule pas ici : de l'argent a réellement été reçu. Le statut de l'hôtel est
   * recalculé tout de suite, avec les mêmes règles que la garde d'accès (etatAbonnement), sans attendre la tâche de minuit.
   */
  async annulerPaiement(hotelId: string, paiementId: string, dto: AnnulerPaiementDto, superAdminId: string) {
    const paiement = await this.prisma.paiementLicence.findFirst({
      where: { id: paiementId, hotelId },
      include: { paiementAbonnement: { select: { id: true } } },
    });
    if (!paiement) throw new NotFoundException("Paiement introuvable pour cet hôtel.");
    if (paiement.paiementAbonnement) {
      throw new BadRequestException("C'est un paiement en ligne réellement reçu : il ne peut pas être annulé ici.");
    }
    if (paiement.annuleLe) throw new ConflictException("Ce paiement est déjà annulé.");

    // Compare-and-swap : deux annulations simultanées ne peuvent pas toutes les deux réussir.
    const { count } = await this.prisma.paiementLicence.updateMany({
      where: { id: paiementId, annuleLe: null },
      data: { annuleLe: new Date(), annuleParSuperAdminId: superAdminId, motifAnnulation: dto.motif.trim() },
    });
    if (count === 0) throw new ConflictException("Ce paiement est déjà annulé.");

    await this.recalculerStatut(hotelId);
    return this.listerPaiements(hotelId);
  }

  /** Statut d'un hôtel ESSAI/ACTIF après la disparition d'un paiement : plus aucun paiement valide → ESSAI ; échéance dépassée
   * (grâce comprise) → SUSPENDU. Une suspension manuelle ou une résiliation n'est jamais touchée. */
  private async recalculerStatut(hotelId: string) {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      include: { paiementsLicence: { where: { annuleLe: null }, orderBy: { periodeCouverteJusquau: "desc" }, take: 1 } },
    });
    if (hotel.suspensionManuelle || !["ESSAI", "ACTIF"].includes(hotel.statutLicence)) return;
    const { parametres } = await lireCatalogue(this.prisma);
    const dernier = hotel.paiementsLicence[0] ?? null;
    const base = dernier ? "ACTIF" : "ESSAI";
    const etat = etatAbonnement({ ...hotel, statutLicence: base }, dernier, new Date(), parametres);
    const nouveau = etat.bloque ? "SUSPENDU" : base;
    if (nouveau !== hotel.statutLicence) {
      await this.prisma.hotel.update({ where: { id: hotelId }, data: { statutLicence: nouveau, suspensionManuelle: false } });
    }
  }

  /**
   * Appelée quotidiennement par LicenceSchedulerService (voir ce fichier) —
   * extraite en méthode ordinaire pour rester testable directement, sans
   * attendre un vrai déclenchement cron (pattern standard NestJS).
   * RESILIE volontairement exclu : un hôtel déjà résilié ne doit pas être
   * "re-suspendu" (ça n'a pas de sens), seuls ESSAI/ACTIF peuvent expirer.
   */
  async suspendreHotelsExpires(): Promise<number> {
    const hotels = await this.prisma.hotel.findMany({
      where: { statutLicence: { in: ["ESSAI", "ACTIF"] } },
      include: { paiementsLicence: { where: { annuleLe: null }, orderBy: { periodeCouverteJusquau: "desc" }, take: 1 } },
    });

    const maintenant = new Date();
    const { parametres } = await lireCatalogue(this.prisma);
    // Suspendu seulement APRÈS le délai de grâce (3 jours) : c'est le même calcul que la garde d'accès (etatAbonnement), pour que le statut
    // posé ici ne contredise jamais ce que voit l'application.
    const aSuspendre = hotels.filter((hotel) => etatAbonnement(hotel, hotel.paiementsLicence[0] ?? null, maintenant, parametres).bloque);

    if (aSuspendre.length > 0) {
      await this.prisma.hotel.updateMany({
        where: { id: { in: aSuspendre.map((h) => h.id) } },
        data: { statutLicence: "SUSPENDU", suspensionManuelle: false },
      });
      this.logger.log(`${aSuspendre.length} hôtel(s) suspendu(s) pour licence expirée : ${aSuspendre.map((h) => h.sousDomaine).join(", ")}`);
      // Le patron l'apprend même si l'accès à l'application lui est désormais refusé (le push, lui, part).
      for (const hotel of aSuspendre) {
        void this.notifications.emettre({
          hotelId: hotel.id,
          roles: [Role.PATRON],
          cleDedup: `licence-suspendue:${hotel.id}:${maintenant.toISOString().slice(0, 10)}`,
          ...messages.licenceSuspendue(),
        });
      }
    }

    return aSuspendre.length;
  }

  /**
   * Onboarding manuel du domaine personnalisé d'un hôtel (Phase 13, décision
   * du patron : jamais en libre-service — voir DECISIONS.md). Écrit en base
   * seulement après le succès de l'appel Render : jamais d'état "en base
   * mais pas chez Render" en cas d'échec.
   */
  async ajouterDomainePersonnalise(hotelId: string, dto: AjouterDomaineDto) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) {
      throw new NotFoundException(`Aucun hôtel trouvé avec l'identifiant ${hotelId}.`);
    }
    const catalogue = await lireCatalogue(this.prisma);
    const fonctions = fonctionsAutorisees(hotel, (await this.prisma.paiementLicence.count({ where: { hotelId, annuleLe: null } })) > 0, catalogue.formules, catalogue.parametres);
    if (!fonctions.includes("DOMAINE_PERSONNALISE")) {
      throw new BadRequestException("La formule de cet hôtel n'inclut pas le domaine personnalisé : changez sa formule d'abord.");
    }
    if (hotel.domainePersonnalise) {
      throw new ConflictException(
        `L'hôtel a déjà le domaine "${hotel.domainePersonnalise}" — retirez-le avant d'en ajouter un autre.`
      );
    }

    const resultat = await this.renderDomains.ajouterDomaine(dto.domaine);

    try {
      return await this.prisma.hotel.update({
        where: { id: hotelId },
        data: {
          domainePersonnalise: resultat.name,
          domainePersonnaliseId: resultat.id,
          domaineVerifie: resultat.verifie,
          domaineAjouteLe: new Date(),
        },
      });
    } catch (error) {
      // Écriture Prisma échouée (ex. domaine déjà utilisé par un autre hôtel
      // dans notre propre base) après que Render l'a déjà accepté : on
      // retire côté Render pour ne pas laisser un domaine orphelin attaché
      // au service sans qu'aucun hôtel ne le référence chez nous.
      await this.renderDomains.supprimerDomaine(resultat.id).catch(() => undefined);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(`Le domaine "${dto.domaine}" est déjà utilisé par un autre hôtel.`);
      }
      throw error;
    }
  }

  /**
   * Redemande à Render l'état de vérification DNS connu — jamais de cron
   * automatique dans cette phase (voir RenderDomainsService), le
   * Super-Admin déclenche lui-même la relecture avec un bouton "Vérifier".
   */
  async verifierDomainePersonnalise(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) {
      throw new NotFoundException(`Aucun hôtel trouvé avec l'identifiant ${hotelId}.`);
    }
    if (!hotel.domainePersonnaliseId) {
      throw new BadRequestException("Cet hôtel n'a aucun domaine personnalisé configuré.");
    }

    const statut = await this.renderDomains.statutDomaine(hotel.domainePersonnaliseId);
    // Le domaine a disparu côté Render (ex. retiré depuis le dashboard) sans
    // qu'on nous informe : on aligne notre base sur cette réalité plutôt que
    // de continuer à afficher un domaine qui n'existe plus.
    if (!statut) {
      return this.prisma.hotel.update({
        where: { id: hotelId },
        data: { domainePersonnalise: null, domainePersonnaliseId: null, domaineVerifie: false, domaineAjouteLe: null },
      });
    }

    return this.prisma.hotel.update({ where: { id: hotelId }, data: { domaineVerifie: statut.verifie } });
  }

  async retirerDomainePersonnalise(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) {
      throw new NotFoundException(`Aucun hôtel trouvé avec l'identifiant ${hotelId}.`);
    }
    if (!hotel.domainePersonnaliseId) {
      throw new BadRequestException("Cet hôtel n'a aucun domaine personnalisé configuré.");
    }

    await this.renderDomains.supprimerDomaine(hotel.domainePersonnaliseId);
    return this.prisma.hotel.update({
      where: { id: hotelId },
      data: { domainePersonnalise: null, domainePersonnaliseId: null, domaineVerifie: false, domaineAjouteLe: null },
    });
  }
}
