import { FONCTIONS, LIBELLE_FONCTION, type Fonction } from "@hotel-chicago/regles";

/** Libellés courts pour les pastilles (le libellé complet, `LIBELLE_FONCTION`, sert aux cases à cocher et aux infobulles). */
export const LIBELLE_COURT_FONCTION: Record<Fonction, string> = {
  RECEPTION: "Réception",
  CAFETERIA: "Cafétaria",
  SITE_PUBLIC: "Site public",
  DOMAINE_PERSONNALISE: "Domaine personnalisé",
  ACOMPTE_EN_LIGNE: "Acompte en ligne",
};

export { FONCTIONS, LIBELLE_FONCTION };
export type { Fonction };

/** Bascule une fonction dans une liste en gardant l'ordre canonique. */
export function basculerFonction(liste: Fonction[], fonction: Fonction): Fonction[] {
  const present = liste.includes(fonction);
  return FONCTIONS.filter((f) => (f === fonction ? !present : liste.includes(f)));
}

/** Messages d'aide communs. */
export const AIDE_FORMULES = "Vous définissez ici ce que chaque hôtel peut utiliser. Les applications masquent automatiquement les fonctions non incluses.";
