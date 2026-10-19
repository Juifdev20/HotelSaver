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

/** Arrondi à l'unité entière SUPÉRIEURE (dollar ou franc) : le Mobile Money de ScanLinkPay refuse les centimes (« Ce mode de
 * paiement n'accepte que des montants entiers », constaté en production le 19/10/2026). */
export function arrondirUniteSuperieure(montant: number): number {
  return Math.max(0, Math.ceil(arrondirDevise(montant, "USD") - 1e-9));
}

/** L'acompte demandé au total : `pourcentage` % du séjour estimé (prix de la nuit × nuits), arrondi vers le haut à l'unité entière
 * (payable en Mobile Money, et l'hôtel ne perd jamais rien). */
export function objectifAcompte(p: { prixParNuit: number; nuits: number; pourcentage: number; devise: "USD" | "CDF" }): number {
  if (!(p.pourcentage > 0) || !(p.prixParNuit > 0)) return 0;
  return arrondirUniteSuperieure((p.prixParNuit * p.nuits * Math.min(p.pourcentage, 100)) / 100);
}

/** Ce qui reste à payer (jamais négatif), en unités entières (un acompte déjà versé avec des centimes laisse un reste payable
 * en Mobile Money). `devise` reste dans la signature pour les appelants. */
export function resteAPayer(objectif: number, dejaPaye: number, _devise: "USD" | "CDF"): number {
  return arrondirUniteSuperieure(Math.max(0, objectif - dejaPaye));
}

export const versCentimes = (montant: number): number => Math.round(montant * 100);
export const depuisCentimes = (centimes: number | null | undefined): number | null => (centimes === null || centimes === undefined ? null : Math.round(centimes) / 100);
