/** Calculs de l'acompte en ligne — purs, donc testables sans base ni réseau. */
const JOUR_MS = 86_400_000;

export function nombreDeNuits(dateArrivee: Date, dateDepart: Date): number {
  return Math.max(1, Math.round((dateDepart.getTime() - dateArrivee.getTime()) / JOUR_MS));
}

/** Arrondi à la plus petite unité de la devise : le cent en dollars, le franc entier en francs (FlexPaie n'accepte pas de centimes de franc). */
export function arrondirDevise(montant: number, devise: "USD" | "CDF", versLeHaut = false): number {
  if (devise === "CDF") return versLeHaut ? Math.ceil(montant - 1e-9) : Math.round(montant);
  const centimes = (montant + Number.EPSILON * Math.max(1, Math.abs(montant))) * 100;
  return (versLeHaut ? Math.ceil(centimes - 1e-6) : Math.round(centimes)) / 100;
}

/** L'acompte demandé au total : `pourcentage` % du séjour estimé (prix de la nuit × nuits), arrondi vers le haut pour que l'hôtel ne perde jamais un centime. */
export function objectifAcompte(p: { prixParNuit: number; nuits: number; pourcentage: number; devise: "USD" | "CDF" }): number {
  if (!(p.pourcentage > 0) || !(p.prixParNuit > 0)) return 0;
  return arrondirDevise((p.prixParNuit * p.nuits * Math.min(p.pourcentage, 100)) / 100, p.devise, true);
}

/** Ce qui reste à payer (jamais négatif), à la précision de la devise. */
export function resteAPayer(objectif: number, dejaPaye: number, devise: "USD" | "CDF"): number {
  return arrondirDevise(Math.max(0, objectif - dejaPaye), devise);
}

export const versCentimes = (montant: number): number => Math.round(montant * 100);
export const depuisCentimes = (centimes: number | null | undefined): number | null => (centimes === null || centimes === undefined ? null : Math.round(centimes) / 100);
