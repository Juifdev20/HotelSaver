import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@hotel-chicago/database";
import { Role } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { messages } from "../notifications/messages";
import { CreerHotelDto } from "./dto/creer-hotel.dto";
import { ChangerStatutHotelDto } from "./dto/changer-statut-hotel.dto";
import { EnregistrerPaiementDto } from "./dto/enregistrer-paiement.dto";
import { AjouterDomaineDto } from "./dto/ajouter-domaine.dto";
import { extraireCouleursLogo } from "../common/palette/extraire-couleurs-logo";
import { genererPalette } from "../common/palette/generer-palette";
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
      include: { branding: true, paiementsLicence: { orderBy: { periodeCouverteJusquau: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
    return hotels.map(({ paiementsLicence, ...hotel }) => ({
      ...hotel,
      valideJusquau: calculerFinValidite(hotel, paiementsLicence[0] ?? null),
    }));
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
    return this.prisma.hotel.update({ where: { id }, data: { statutLicence: dto.statutLicence } });
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
      this.prisma.hotel.update({ where: { id: hotelId }, data: { statutLicence: "ACTIF" } }),
    ]);

    return paiement;
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
      include: { paiementsLicence: { orderBy: { periodeCouverteJusquau: "desc" }, take: 1 } },
    });

    const maintenant = new Date();
    const aSuspendre = hotels.filter(
      (hotel) => calculerFinValidite(hotel, hotel.paiementsLicence[0] ?? null) < maintenant
    );

    if (aSuspendre.length > 0) {
      await this.prisma.hotel.updateMany({
        where: { id: { in: aSuspendre.map((h) => h.id) } },
        data: { statutLicence: "SUSPENDU" },
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
