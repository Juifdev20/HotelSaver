/**
 * Chambre déjà prise : une demande en attente (site public ou réception) dont la chambre est DÉJÀ confirmée ou occupée par un autre client sur
 * ces dates. Calculé sur les réservations déjà présentes dans l'application (donc aussi hors ligne). La réception voit l'avertissement et ne peut
 * pas « confirmer » : elle propose une autre chambre ou d'autres dates, ou refuse la demande.
 */
export interface ReservationPourConflit {
  id: string;
  chambreId: string;
  statut: string;
  dateArrivee: string | Date;
  dateDepart: string | Date;
}

const t = (d: string | Date) => (d instanceof Date ? d.getTime() : Date.parse(d));

/** Les identifiants des demandes EN_ATTENTE qui chevauchent une réservation CONFIRMEE ou EN_COURS de la même chambre (autre réservation). */
export function demandesSurChambrePrise(reservations: readonly ReservationPourConflit[]): Set<string> {
  const occupantes = reservations.filter((r) => r.statut === "CONFIRMEE" || r.statut === "EN_COURS");
  const resultat = new Set<string>();
  for (const demande of reservations) {
    if (demande.statut !== "EN_ATTENTE") continue;
    const debut = t(demande.dateArrivee);
    const fin = t(demande.dateDepart);
    if (occupantes.some((o) => o.id !== demande.id && o.chambreId === demande.chambreId && t(o.dateArrivee) < fin && t(o.dateDepart) > debut)) resultat.add(demande.id);
  }
  return resultat;
}

export const TEXTE_CHAMBRE_DEJA_PRISE = "Chambre déjà réservée par un autre client sur ces dates : proposez une autre chambre ou d'autres dates, ou refusez cette demande.";
