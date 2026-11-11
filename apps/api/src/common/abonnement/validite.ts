import type { Prisma } from "@hotel-chicago/database";
import { etatAbonnement, type ContexteLicence, type ParametresAbonnement, type ParametresProtectionEssai } from "@hotel-chicago/regles";
import type { EtatAbonnement } from "@hotel-chicago/types";

/**
 * Ce qu'il faut charger avec un hôtel pour juger de son accès : son dernier paiement d'abonnement, et la licence EN COURS (11/11/2026) avec le
 * dernier paiement de sa maintenance. `maintenant` borne la licence en cours (début ≤ maintenant ≤ fin, non annulée).
 */
export function inclureValidite(maintenant: Date = new Date()) {
  return {
    paiementsLicence: { where: { annuleLe: null }, orderBy: { periodeCouverteJusquau: "desc" }, take: 1, select: { periodeCouverteJusquau: true } },
    licences: {
      where: { annuleLe: null, debutLe: { lte: maintenant }, finLe: { gte: maintenant } },
      orderBy: { debutLe: "desc" },
      take: 1,
      select: {
        id: true,
        annees: true,
        debutLe: true,
        finLe: true,
        fraisMaintenanceUsd: true,
        paiementsMaintenance: { where: { annuleLe: null }, orderBy: { periodeCouverteJusquau: "desc" }, take: 1, select: { periodeCouverteJusquau: true } },
      },
    },
  } satisfies Prisma.HotelInclude;
}

type HotelAvecValidite = Prisma.HotelGetPayload<{ include: ReturnType<typeof inclureValidite> }>;
type ReglagesLicence = Pick<ParametresAbonnement, "fraisMaintenanceUsd" | "joursGraceMaintenance" | "joursPreavisMaintenance">;

/** La licence en cours d'un hôtel chargé avec `inclureValidite`, prête pour `etatAbonnement` ; null s'il n'en a pas. */
export function contexteLicence(hotel: Pick<HotelAvecValidite, "licences">, parametres: ReglagesLicence): (ContexteLicence & { id: string }) | null {
  const l = hotel.licences?.[0];
  if (!l) return null;
  return {
    id: l.id,
    annees: l.annees,
    debutLe: l.debutLe,
    finLe: l.finLe,
    derniereMaintenanceJusquau: l.paiementsMaintenance[0]?.periodeCouverteJusquau ?? null,
    fraisMaintenanceUsd: l.fraisMaintenanceUsd === null ? parametres.fraisMaintenanceUsd : Number(l.fraisMaintenanceUsd),
    joursGraceMaintenance: parametres.joursGraceMaintenance,
    joursPreavisMaintenance: parametres.joursPreavisMaintenance,
  };
}

/** L'état d'abonnement d'un hôtel chargé avec `inclureValidite` : le MÊME calcul partout (garde d'accès, profil, abonnement, suspension, rappels). */
export function etatDeHotel(
  hotel: Parameters<typeof etatAbonnement>[0] & Pick<HotelAvecValidite, "paiementsLicence" | "licences">,
  parametres: Partial<Pick<ParametresAbonnement, "joursEssai" | "joursGrace"> & ParametresProtectionEssai> & ReglagesLicence,
  maintenant: Date = new Date()
): EtatAbonnement {
  return etatAbonnement(hotel, hotel.paiementsLicence[0] ?? null, maintenant, parametres, contexteLicence(hotel, parametres));
}

/**
 * Statut d'un hôtel ESSAI/ACTIF après la disparition d'un paiement ou d'une licence : plus rien de valide → ESSAI ; échéance dépassée (grâce comprise)
 * → SUSPENDU. Une suspension manuelle ou une résiliation n'est jamais touchée. Mêmes règles que la garde d'accès (`etatDeHotel`).
 */
export async function recalculerStatutHotel(
  prisma: import("@hotel-chicago/database").PrismaClient,
  hotelId: string,
  parametres: Parameters<typeof etatDeHotel>[1]
): Promise<void> {
  const maintenant = new Date();
  const hotel = await prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, include: inclureValidite(maintenant) });
  if (hotel.suspensionManuelle || !["ESSAI", "ACTIF"].includes(hotel.statutLicence)) return;
  const paye = hotel.paiementsLicence.length > 0 || (hotel.licences?.length ?? 0) > 0;
  const base = paye ? "ACTIF" : "ESSAI";
  const etat = etatDeHotel({ ...hotel, statutLicence: base }, parametres, maintenant);
  const nouveau = etat.bloque ? "SUSPENDU" : base;
  if (nouveau !== hotel.statutLicence) {
    await prisma.hotel.update({ where: { id: hotelId }, data: { statutLicence: nouveau, suspensionManuelle: false } });
  }
}
