import type { PrismaClient } from "@hotel-chicago/database";

/** Une réservation confirmée ou en cours occupe la chambre. Une simple demande (EN_ATTENTE) ne la bloque pas. */
export const STATUTS_QUI_OCCUPENT = ["CONFIRMEE", "EN_COURS"] as const;

/** Un client dont le paiement attend la confirmation sur son téléphone « retient » la chambre ce temps-là : personne d'autre ne peut la payer en même temps. */
export const DELAI_RETENUE_PAIEMENT_MS = 10 * 60_000;

export type EtatChambre = "RESERVEE" | "EN_COURS_DE_PAIEMENT";

export interface OccupationChambre {
  etat: EtatChambre;
  /** Premier jour où la chambre est de nouveau libre (départ de la réservation qui la retient). */
  libreLe: Date;
}

export const MESSAGE_CHAMBRE_RESERVEE = "Cette chambre est déjà réservée pour ces dates. Choisissez d'autres dates ou une autre chambre.";
export const MESSAGE_CHAMBRE_EN_COURS = "Cette chambre est en cours de réservation par un autre client. Réessayez dans quelques minutes.";

/**
 * Pour une période [debut, fin) : quelles chambres de l'hôtel sont déjà prises, et par quoi. UNE seule règle pour le site public, la demande de
 * réservation et le paiement de l'acompte :
 *  - RESERVEE : une réservation confirmée (acompte payé, ou validée par la réception) ou en cours couvre ces dates ;
 *  - EN_COURS_DE_PAIEMENT : un autre client est en train de payer son acompte pour ces dates (retenue de 10 minutes).
 * `exclureReservationId` : la réservation du client lui-même ne compte jamais contre lui.
 * Aucune donnée sur l'autre client n'est renvoyée.
 */
export async function chambresPrises(
  prisma: PrismaClient,
  p: { hotelId: string; debut: Date; fin: Date; chambreId?: string; exclureReservationId?: string }
): Promise<Map<string, OccupationChambre>> {
  const chevauche = { dateArrivee: { lt: p.fin }, dateDepart: { gt: p.debut } };
  const base = { hotelId: p.hotelId, ...(p.chambreId ? { chambreId: p.chambreId } : {}), ...(p.exclureReservationId ? { id: { not: p.exclureReservationId } } : {}), ...chevauche };
  const resultat = new Map<string, OccupationChambre>();

  const confirmees = await prisma.reservation.findMany({ where: { ...base, statut: { in: [...STATUTS_QUI_OCCUPENT] } }, select: { chambreId: true, dateDepart: true } });
  for (const r of confirmees) {
    const deja = resultat.get(r.chambreId);
    if (!deja || r.dateDepart < deja.libreLe) resultat.set(r.chambreId, { etat: "RESERVEE", libreLe: r.dateDepart });
  }

  const enAttente = await prisma.paiementReservation.findMany({
    where: { hotelId: p.hotelId, statut: "EN_ATTENTE", createdAt: { gt: new Date(Date.now() - DELAI_RETENUE_PAIEMENT_MS) } },
    select: { reservationId: true },
  });
  if (enAttente.length > 0) {
    const retenues = await prisma.reservation.findMany({
      where: { ...base, id: { in: enAttente.map((e) => e.reservationId).filter((id) => id !== p.exclureReservationId) }, statut: { in: ["EN_ATTENTE", "CONFIRMEE"] } },
      select: { chambreId: true, dateDepart: true },
    });
    for (const r of retenues) {
      if (!resultat.has(r.chambreId)) resultat.set(r.chambreId, { etat: "EN_COURS_DE_PAIEMENT", libreLe: r.dateDepart });
    }
  }
  return resultat;
}
