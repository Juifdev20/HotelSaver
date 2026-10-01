import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaClient } from "@hotel-chicago/database";
import { Role, type UtilisateurAuthentifie } from "@hotel-chicago/types";
import { DashboardService } from "../dashboard/dashboard.service";
import { PRISMA } from "../prisma/prisma.module";
import { calculerFinValidite } from "../super-admin/calculer-validite";
import { messages } from "./messages";
import { NotificationsService } from "./notifications.service";

const FUSEAU = "Africa/Lubumbashi";
/** Lubumbashi est à UTC+2 toute l'année (pas d'heure d'été). */
const DECALAGE_HEURES = 2;
const JOUR_MS = 24 * 60 * 60 * 1000;
const JOURS_PREAVIS_LICENCE = 7;

/** Bornes [début, fin[ de la journée courante à Lubumbashi, en instants UTC. */
export function bornesDuJour(maintenant: Date): { debut: Date; fin: Date; cle: string } {
  const local = new Date(maintenant.getTime() + DECALAGE_HEURES * 3600_000);
  const debutLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const debut = new Date(debutLocal - DECALAGE_HEURES * 3600_000);
  return { debut, fin: new Date(debut.getTime() + JOUR_MS), cle: new Date(debutLocal).toISOString().slice(0, 10) };
}

/**
 * Alertes planifiées, hôtel par hôtel (jamais de mélange) : chaque tâche isole ses erreurs pour
 * qu'un hôtel en échec n'empêche pas les autres. Méthodes publiques = testables sans attendre le cron.
 */
@Injectable()
export class NotificationsSchedulerService {
  private readonly logger = new Logger(NotificationsSchedulerService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notifications: NotificationsService,
    private readonly dashboard: DashboardService
  ) {}

  private hotelsActifs() {
    return this.prisma.hotel.findMany({ where: { statutLicence: { in: ["ESSAI", "ACTIF"] } }, select: { id: true } });
  }

  /** 07:00 — « 3 arrivées et 2 départs aujourd'hui » pour la réception et le patron. */
  @Cron("0 7 * * *", { timeZone: FUSEAU })
  async arriveesEtDeparts(maintenant = new Date()): Promise<void> {
    try {
      const { debut, fin, cle } = bornesDuJour(maintenant);
      for (const hotel of await this.hotelsActifs()) {
        try {
          const [arrivees, departs] = await Promise.all([
            this.prisma.reservation.count({
              where: { hotelId: hotel.id, statut: { in: ["CONFIRMEE", "EN_ATTENTE"] }, dateArrivee: { gte: debut, lt: fin } },
            }),
            this.prisma.reservation.count({
              where: { hotelId: hotel.id, statut: "EN_COURS", dateDepart: { gte: debut, lt: fin } },
            }),
          ]);
          if (arrivees + departs === 0) continue;
          await this.notifications.emettre({
            hotelId: hotel.id,
            roles: [Role.RECEPTIONNISTE, Role.PATRON],
            cleDedup: `arrivees:${cle}`,
            ...messages.arriveesDuJour({ arrivees, departs }),
          });
        } catch (erreur) {
          this.logger.error(`Arrivées/départs (hôtel ${hotel.id}) : ${(erreur as Error).message}`);
        }
      }
    } catch (erreur) {
      this.logger.error(`Arrivées/départs : ${(erreur as Error).message}`);
    }
  }

  /** Toutes les heures — séjour en cours dont l'heure de départ est passée ; une seule alerte par réservation. */
  @Cron("0 * * * *", { timeZone: FUSEAU })
  async departsDepasses(maintenant = new Date()): Promise<void> {
    try {
      const reservations = await this.prisma.reservation.findMany({
        where: {
          statut: "EN_COURS",
          dateDepart: { lt: maintenant, gt: new Date(maintenant.getTime() - JOUR_MS) },
          hotel: { statutLicence: { in: ["ESSAI", "ACTIF"] } },
        },
        include: { client: { select: { nom: true } }, chambre: { select: { numero: true } } },
        take: 200,
      });
      for (const r of reservations) {
        await this.notifications.emettre({
          hotelId: r.hotelId,
          roles: [Role.RECEPTIONNISTE, Role.PATRON],
          cleDedup: `depart:${r.id}`,
          ...messages.departDepasse({
            client: r.client?.nom ?? "Client",
            chambre: r.chambre?.numero ?? "?",
            dateDepart: r.dateDepart,
            reservationId: r.id,
          }),
        });
      }
    } catch (erreur) {
      this.logger.error(`Départs dépassés : ${(erreur as Error).message}`);
    }
  }

  /** 20:00 — récap de la recette du jour au patron. */
  @Cron("0 20 * * *", { timeZone: FUSEAU })
  async recapDuSoir(maintenant = new Date()): Promise<void> {
    try {
      const { cle } = bornesDuJour(maintenant);
      for (const hotel of await this.hotelsActifs()) {
        try {
          const systeme = { userId: "systeme", supabaseAuthId: "systeme", role: Role.PATRON, nom: "Système", hotelId: hotel.id } as UtilisateurAuthentifie;
          const { total } = await this.dashboard.recetteDuJour(systeme);
          if (total.montantUSD === 0 && total.montantCDF === 0) continue;
          await this.notifications.emettre({
            hotelId: hotel.id,
            roles: [Role.PATRON],
            cleDedup: `recap:${cle}`,
            ...messages.recapQuotidien({ usd: total.montantUSD, cdf: total.montantCDF }),
          });
        } catch (erreur) {
          this.logger.error(`Récap (hôtel ${hotel.id}) : ${(erreur as Error).message}`);
        }
      }
    } catch (erreur) {
      this.logger.error(`Récap du soir : ${(erreur as Error).message}`);
    }
  }

  /** 08:00 — prévient le patron 7 jours, puis chaque jour restant, avant l'expiration. */
  @Cron("0 8 * * *", { timeZone: FUSEAU })
  async licencesBientotExpirees(maintenant = new Date()): Promise<void> {
    try {
      const hotels = await this.prisma.hotel.findMany({
        where: { statutLicence: { in: ["ESSAI", "ACTIF"] } },
        include: { paiementsLicence: { orderBy: { periodeCouverteJusquau: "desc" }, take: 1 } },
      });
      const { cle } = bornesDuJour(maintenant);
      for (const hotel of hotels) {
        const fin = calculerFinValidite(hotel, hotel.paiementsLicence[0] ?? null);
        const jours = Math.ceil((fin.getTime() - maintenant.getTime()) / JOUR_MS);
        if (jours < 1 || jours > JOURS_PREAVIS_LICENCE) continue;
        await this.notifications.emettre({
          hotelId: hotel.id,
          roles: [Role.PATRON],
          cleDedup: `licence-bientot:${hotel.id}:${cle}`,
          ...messages.licenceBientotExpiree({ jours }),
        });
      }
    } catch (erreur) {
      this.logger.error(`Licences bientôt expirées : ${(erreur as Error).message}`);
    }
  }
}
