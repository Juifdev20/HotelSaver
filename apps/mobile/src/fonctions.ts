import type { CodeFonction } from "@hotel-chicago/types";

export type { CodeFonction };

/**
 * Fonctions ouvertes à l'hôtel par sa formule d'abonnement (RECEPTION, CAFETERIA, SITE_PUBLIC, DOMAINE_PERSONNALISE, ACOMPTE_EN_LIGNE).
 * `ProfilConnecte.fonctions` absent (ancien profil mémorisé, ancien serveur) = TOUT est ouvert : on ne cache jamais un écran sur un doute.
 * Le serveur reste juge : il répond 403 FONCTION_NON_INCLUSE à toute route fermée.
 */
export function fonctionOuverte(fonctions: readonly string[] | undefined, fonction: CodeFonction): boolean {
  return !fonctions || fonctions.includes(fonction);
}

/** Courte description d'une fonction, pour une phrase (« La réception… »). */
export const DESCRIPTION_FONCTION: Record<CodeFonction, string> = {
  RECEPTION: "La réception (chambres, réservations, clients, facturation)",
  CAFETERIA: "La cafétaria (menu, stock, comptes ouverts, ventes)",
  SITE_PUBLIC: "Le site de l'hôtel",
  DOMAINE_PERSONNALISE: "Le nom de site personnalisé",
  ACOMPTE_EN_LIGNE: "Le paiement de l'acompte en ligne",
};

/** Le serveur a refusé : la formule de l'hôtel n'ouvre pas cette fonction (403, code FONCTION_NON_INCLUSE). */
export function estFonctionNonIncluse(erreur: unknown): boolean {
  const e = erreur as { statusCode?: unknown; code?: unknown } | null;
  return !!e && typeof e === "object" && e.statusCode === 403 && e.code === "FONCTION_NON_INCLUSE";
}

// ------------------------------------------------------------------------------------------------------------------------------
// Signal « le profil est peut-être périmé » : une erreur FONCTION_NON_INCLUSE alors que l'écran se croyait autorisé veut dire que la
// formule a changé (ou que le profil mémorisé est ancien). App.tsx relit alors le profil, et les écrans fermés disparaissent.

type Ecouteur = () => void;
const ecouteurs = new Set<Ecouteur>();
let dernierSignal = 0;
const DELAI_ENTRE_SIGNAUX_MS = 15_000;

export function ecouterFonctionNonIncluse(ecouteur: Ecouteur): () => void {
  ecouteurs.add(ecouteur);
  return () => {
    ecouteurs.delete(ecouteur);
  };
}

/** Prévient (au plus une fois toutes les 15 s, hors du rendu en cours) que le serveur a refusé une fonction. */
export function signalerFonctionNonIncluse(): void {
  const maintenant = Date.now();
  if (maintenant - dernierSignal < DELAI_ENTRE_SIGNAUX_MS) return;
  dernierSignal = maintenant;
  setTimeout(() => {
    for (const ecouteur of [...ecouteurs]) ecouteur();
  }, 0);
}
