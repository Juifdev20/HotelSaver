import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { PrismaClient } from "@hotel-chicago/database";
import { Role } from "@hotel-chicago/types";
import { dateAbonnement, etatAbonnement } from "@hotel-chicago/regles";
import { PRISMA } from "../prisma/prisma.module";
import { lireCatalogue } from "../common/abonnement/catalogue";
import { SupabaseAdminService } from "../common/supabase-admin/supabase-admin.service";
import { SupabaseStorageService } from "../common/supabase-storage/supabase-storage.service";
import { NotificationsService } from "../notifications/notifications.service";
import { messages } from "../notifications/messages";
import { empreinte } from "../public/protection-inscription";

const JOUR_MS = 86_400_000;
const FUSEAU = "Africa/Lubumbashi";
/** Rappels au patron avant la suppression. */
const RAPPELS_JOURS = [3, 1];

/**
 * Nettoyage des essais abandonnés (18/10/2026, voir DECISIONS.md « Protection contre les essais abusifs ») : un hôtel qui n'a JAMAIS payé
 * et dont l'essai est fini (délai de grâce compris) est supprimé `joursAvantSuppression` jours plus tard — réglage du super-admin.
 *
 * Garde-fous : seulement les hôtels en ESSAI ou suspendus AUTOMATIQUEMENT à l'échéance, sans formule, sans paiement de licence non
 * annulé et sans paiement d'abonnement réussi. Jamais un hôtel ACTIF (dont ceux créés par le super-admin), jamais une suspension
 * manuelle, jamais un hôtel qui a payé une seule fois. Le numéro du patron reste marqué « essai utilisé » (EssaiUtilise).
 */
@Injectable()
export class NettoyageEssaisService {
  private readonly logger = new Logger(NettoyageEssaisService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly stockage: SupabaseStorageService,
    private readonly notifications: NotificationsService
  ) {}

  /** Hôtels candidats : jamais payés, en essai ou suspendus automatiquement. */
  async candidats() {
    return this.prisma.hotel.findMany({
      where: {
        formule: null,
        OR: [{ statutLicence: "ESSAI" }, { statutLicence: "SUSPENDU", suspensionManuelle: false }],
        paiementsLicence: { none: { annuleLe: null } },
        paiementsAbonnement: { none: { statut: "REUSSI" } },
      },
      select: { id: true, nom: true, sousDomaine: true, createdAt: true, statutLicence: true, suspensionManuelle: true, joursEssai: true },
    });
  }

  /** Date de suppression prévue de chaque hôtel candidat (liste des hôtels du super-admin) — même calcul que la tâche. */
  async datesSuppression(maintenant = new Date()): Promise<Map<string, string>> {
    const { parametres } = await lireCatalogue(this.prisma);
    const dates = new Map<string, string>();
    for (const hotel of await this.candidats()) {
      const { suppressionLe } = etatAbonnement(hotel, null, maintenant, parametres);
      if (suppressionLe) dates.set(hotel.id, suppressionLe);
    }
    return dates;
  }

  /** Trace des hôtels supprimés, les plus récents d'abord. */
  async hotelsSupprimes() {
    const lignes = await this.prisma.hotelSupprime.findMany({ orderBy: { supprimeLe: "desc" }, take: 500 });
    return lignes.map((l) => ({ id: l.id, nom: l.nom, sousDomaine: l.sousDomaine, creeLe: l.creeLe.toISOString(), supprimeLe: l.supprimeLe.toISOString(), motif: l.motif }));
  }

  /** 03:30 — rappels J-3 / J-1, suppressions échues, purge des traces d'inscription de plus de 24 h. */
  @Cron("30 3 * * *", { timeZone: FUSEAU })
  async executer(maintenant = new Date()): Promise<{ supprimes: string[]; prevenus: string[] }> {
    const resultat = { supprimes: [] as string[], prevenus: [] as string[] };
    try {
      await this.prisma.inscriptionRecente.deleteMany({ where: { createdAt: { lt: new Date(maintenant.getTime() - JOUR_MS) } } });
      const { parametres } = await lireCatalogue(this.prisma);
      for (const hotel of await this.candidats()) {
        const { suppressionLe } = etatAbonnement(hotel, null, maintenant, parametres);
        if (!suppressionLe) continue;
        const echeance = new Date(suppressionLe);
        const joursRestants = Math.ceil((echeance.getTime() - maintenant.getTime()) / JOUR_MS);
        if (echeance.getTime() <= maintenant.getTime()) {
          // Un hôtel en échec (réseau, stockage) ne bloque pas les autres : il sera repris au prochain passage.
          try {
            await this.supprimerHotel(hotel, "Essai gratuit terminé sans paiement");
            resultat.supprimes.push(hotel.sousDomaine);
          } catch (erreur) {
            this.logger.error(`Suppression de ${hotel.sousDomaine} reportée : ${(erreur as Error).message}`);
          }
        } else if (RAPPELS_JOURS.includes(joursRestants)) {
          await this.notifications.emettre({
            hotelId: hotel.id,
            roles: [Role.PATRON],
            cleDedup: `suppression-essai:${hotel.id}:${joursRestants}`,
            ...messages.suppressionEssaiProche({ jours: joursRestants, date: dateAbonnement(suppressionLe) }),
          });
          resultat.prevenus.push(hotel.sousDomaine);
        }
      }
      if (resultat.supprimes.length > 0) this.logger.log(`${resultat.supprimes.length} essai(s) abandonné(s) supprimé(s) : ${resultat.supprimes.join(", ")}`);
    } catch (erreur) {
      this.logger.error(`Nettoyage des essais abandonnés : ${(erreur as Error).message}`);
    }
    return resultat;
  }

  /**
   * Supprime un hôtel et TOUT ce qui lui appartient. Ordre : fichiers (si le stockage refuse, on s'arrête : rien n'est effacé en base),
   * puis la base en UNE transaction (enfants d'abord : beaucoup de relations sont en Restrict), puis les comptes Supabase Auth.
   */
  async supprimerHotel(hotel: { id: string; nom: string; sousDomaine: string; createdAt: Date }, motif: string): Promise<void> {
    const utilisateurs = await this.prisma.utilisateur.findMany({ where: { hotelId: hotel.id }, select: { supabaseAuthId: true, telephone: true } });
    await this.stockage.supprimerDossierHotel(hotel.id);

    const h = { hotelId: hotel.id };
    // Transaction interactive avec un délai large : une vingtaine de requêtes à ~250 ms (Kasindi → Supabase) dépassent les 5 s par
    // défaut de Prisma — tout serait alors annulé (rien n'est jamais supprimé à moitié).
    await this.prisma.$transaction(
      async (tx) => {
        // Le numéro garde son « essai utilisé », même pour un hôtel créé avant cette protection.
        for (const u of utilisateurs) {
          if (u.telephone) await tx.essaiUtilise.upsert({ where: { telephoneEmpreinte: empreinte(u.telephone) }, create: { telephoneEmpreinte: empreinte(u.telephone) }, update: {} });
        }
        // Enfants d'abord : beaucoup de relations vers Hotel sont en Restrict.
        await tx.remboursement.deleteMany({ where: h });
        await tx.paiementReservation.deleteMany({ where: h });
        await tx.menuDuJour.deleteMany({ where: h });
        await tx.inventairePhysique.deleteMany({ where: h });
        await tx.mouvementStock.deleteMany({ where: h });
        await tx.ligneCommande.deleteMany({ where: h });
        await tx.venteCafeteria.deleteMany({ where: h });
        await tx.sousCompte.deleteMany({ where: h });
        await tx.compteCafeteria.deleteMany({ where: h });
        await tx.facture.deleteMany({ where: h });
        await tx.reservation.deleteMany({ where: h });
        await tx.client.deleteMany({ where: h });
        await tx.chambre.deleteMany({ where: h });
        await tx.produit.deleteMany({ where: h });
        await tx.tauxChange.deleteMany({ where: h });
        await tx.depense.deleteMany({ where: h });
        await tx.paiementAbonnement.deleteMany({ where: h });
        await tx.paiementLicence.deleteMany({ where: h });
        await tx.utilisateur.deleteMany({ where: h });
        // Le reste (charte, site, notifications, rapports, correspondances de sync…) part en cascade avec l'hôtel.
        await tx.hotel.delete({ where: { id: hotel.id } });
        await tx.hotelSupprime.create({ data: { hotelId: hotel.id, nom: hotel.nom, sousDomaine: hotel.sousDomaine, creeLe: hotel.createdAt, motif } });
      },
      { timeout: 60_000, maxWait: 15_000 }
    );

    // Comptes de connexion : après la base (un compte orphelin ne donne accès à rien — sa ligne Utilisateur n'existe plus).
    for (const u of utilisateurs) {
      if (!u.supabaseAuthId) continue;
      await this.supabaseAdmin.supprimerCompte(u.supabaseAuthId).catch((e: Error) => this.logger.warn(`Compte ${u.supabaseAuthId} non supprimé : ${e.message}`));
    }
  }
}
