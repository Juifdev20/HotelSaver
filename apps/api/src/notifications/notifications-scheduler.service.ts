import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaClient } from "@hotel-chicago/database";
import { Role, type UtilisateurAuthentifie } from "@hotel-chicago/types";
import { DashboardService } from "../dashboard/dashboard.service";
import { PRISMA } from "../prisma/prisma.module";
import { finValidite } from "@hotel-chicago/regles";
import { lireCatalogue } from "../common/abonnement/catalogue";
import { messages } from "./messages";
import { NotificationsService } from "./notifications.service";
import { libelleMois } from "../rapports/agregats/bornes";

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

  /**
   * Toutes les heures — le rappel des 24 h : un produit TOUJOURS au seuil d'alerte (ou épuisé) dont la dernière alerte date de plus de 24 h
   * est annoncé de nouveau (voix dans l'application, notification sonore téléphone éteint), jusqu'à ce que le stock soit rechargé — la quantité
   * remonte au-dessus du seuil et plus rien ne part — ou que l'utilisateur coupe l'alerte (alerte-stock.service : ceux qui l'ont coupée sont
   * écartés à l'émission). Retourne le nombre de produits annoncés.
   */
  @Cron("30 * * * *", { timeZone: FUSEAU })
  async rappelsStock(maintenant = new Date()): Promise<number> {
    let annonces = 0;
    try {
      const limite = new Date(maintenant.getTime() - JOUR_MS);
      for (const hotel of await this.hotelsActifs()) {
        try {
          const produits = await this.prisma.produit.findMany({
            where: { hotelId: hotel.id, actif: true, typeProduit: "ARTICLE" },
            select: { id: true, nom: true, stockActuel: true, seuilAlerte: true },
            take: 2000,
          });
          // Comparaison en JS : Prisma ne compare pas deux colonnes entre elles dans un where.
          const bas = produits.filter((p) => Number(p.stockActuel) <= Number(p.seuilAlerte));
          if (bas.length === 0) continue;
          const recentes = await this.prisma.notification.findMany({
            where: { hotelId: hotel.id, type: { in: ["STOCK_BAS", "STOCK_EPUISE"] }, createdAt: { gt: limite } },
            select: { lien: true },
          });
          const dejaAnnonces = new Set(recentes.map((n) => (n.lien as { id?: string } | null)?.id).filter((id): id is string => !!id));
          for (const produit of bas) {
            if (dejaAnnonces.has(produit.id)) continue;
            const stock = Number(produit.stockActuel);
            await this.notifications.emettre({
              hotelId: hotel.id,
              roles: [Role.CAFETARIA, Role.PATRON],
              cleDedup: `stock-rappel:${produit.id}:${maintenant.getTime()}`,
              ...(stock <= 0
                ? messages.stockEpuise({ produit: produit.nom, produitId: produit.id })
                : messages.stockBas({ produit: produit.nom, stock, produitId: produit.id })),
            });
            annonces += 1;
          }
        } catch (erreur) {
          this.logger.error(`Rappels de stock (hôtel ${hotel.id}) : ${(erreur as Error).message}`);
        }
      }
    } catch (erreur) {
      this.logger.error(`Rappels de stock : ${(erreur as Error).message}`);
    }
    return annonces;
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

  /** 08:00 le 1er du mois — rappel aux deux départements : le rapport PDF du
   * mois écoulé est à générer et à remettre au patron. */
  @Cron("0 8 1 * *", { timeZone: FUSEAU })
  async rappelRapportsMensuels(maintenant = new Date()): Promise<void> {
    try {
      // Le mois écoulé à Lubumbashi (le 1er octobre → « 2026-09 », le 1er
      // janvier → décembre de l'année passée).
      const local = new Date(maintenant.getTime() + DECALAGE_HEURES * 3600_000);
      const m = local.getUTCMonth(); // 0 = janvier : le mois écoulé est m (1-12), décembre si m = 0
      const periode = `${m === 0 ? local.getUTCFullYear() - 1 : local.getUTCFullYear()}-${String(m === 0 ? 12 : m).padStart(2, "0")}`;
      const libelle = libelleMois(periode);
      for (const hotel of await this.hotelsActifs()) {
        for (const [departement, role] of [
          ["Cafétaria", Role.CAFETARIA],
          ["Réception", Role.RECEPTIONNISTE],
        ] as const) {
          try {
            await this.notifications.emettre({
              hotelId: hotel.id,
              roles: [role],
              cleDedup: `rapport-a-generer:${hotel.id}:${periode}:${departement}`,
              ...messages.rapportAGenerer({ departement, mois: libelle }),
            });
          } catch (erreur) {
            this.logger.error(`Rappel rapport ${departement} (hôtel ${hotel.id}) : ${(erreur as Error).message}`);
          }
        }
      }
    } catch (erreur) {
      this.logger.error(`Rappel rapports mensuels : ${(erreur as Error).message}`);
    }
  }

  /** 08:00 — prévient le patron 7 jours, puis chaque jour restant, avant l'expiration. */
  @Cron("0 8 * * *", { timeZone: FUSEAU })
  async licencesBientotExpirees(maintenant = new Date()): Promise<void> {
    try {
      const hotels = await this.prisma.hotel.findMany({
        where: { statutLicence: { in: ["ESSAI", "ACTIF"] } },
        include: { paiementsLicence: { where: { annuleLe: null }, orderBy: { periodeCouverteJusquau: "desc" }, take: 1 } },
      });
      const { cle } = bornesDuJour(maintenant);
      const { parametres } = await lireCatalogue(this.prisma);
      for (const hotel of hotels) {
        const fin = finValidite(hotel, hotel.paiementsLicence[0] ?? null, parametres.joursEssai);
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
