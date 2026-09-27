/** Durée de l'essai gratuit avant qu'un hôtel doive payer (décision du
 * patron, Phase 12) — voir DECISIONS.md. */
export const DUREE_ESSAI_JOURS = 14;

/**
 * Fonction pure : la date de validité d'un hôtel n'est JAMAIS stockée nulle
 * part (voir le commentaire sur `PaiementLicence` dans schema.prisma) —
 * toujours calculée à partir du dernier paiement enregistré (ou, à défaut,
 * `createdAt + 14 jours` pour un essai). Une seule source de vérité, aucune
 * désynchronisation possible entre un champ dénormalisé et l'historique réel.
 */
export function calculerFinValidite(
  hotel: { createdAt: Date },
  dernierPaiement: { periodeCouverteJusquau: Date } | null
): Date {
  if (dernierPaiement) return dernierPaiement.periodeCouverteJusquau;

  const finEssai = new Date(hotel.createdAt);
  finEssai.setDate(finEssai.getDate() + DUREE_ESSAI_JOURS);
  return finEssai;
}
