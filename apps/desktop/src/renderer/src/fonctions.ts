import type { Fonction } from "@hotel-chicago/regles";

/**
 * Fonctions d'abonnement (ce que la formule de l'hôtel ouvre). Le profil porte la liste des fonctions OUVERTES ; absente = tout est ouvert
 * (anciens profils mémorisés). Le serveur refuse de toute façon les routes d'une fonction non incluse (403 FONCTION_NON_INCLUSE) :
 * masquer les écrans n'est qu'un confort, jamais une protection.
 */
export function fonctionOuverte(profil: { fonctions?: string[] } | null | undefined, fonction: Fonction): boolean {
  return !profil?.fonctions || profil.fonctions.includes(fonction);
}

/** Fonction qu'exige chaque écran (les écrans absents d'ici n'exigent rien). */
export const FONCTION_PAR_PAGE: Record<string, Fonction> = {
  chambres: "RECEPTION",
  reservations: "RECEPTION",
  remboursements: "RECEPTION",
  "arrivees-departs": "RECEPTION",
  "journal-journee": "RECEPTION",
  clients: "RECEPTION",
  facturation: "RECEPTION",
  caisse: "CAFETERIA",
  "comptes-ouverts": "CAFETERIA",
  "retrait-commande": "CAFETERIA",
  cuisine: "CAFETERIA",
  menu: "CAFETERIA",
  stock: "CAFETERIA",
  inventaire: "CAFETERIA",
  "site-hotel": "SITE_PUBLIC",
};

/** Nom de la fonction, dit simplement, pour les panneaux « non incluse ». */
export const NOM_FONCTION: Record<Fonction, string> = {
  RECEPTION: "la réception (chambres, réservations, clients, facturation)",
  CAFETERIA: "la cafétaria (menu, stock, comptes ouverts, ventes)",
  SITE_PUBLIC: "le site de réservation de l'hôtel",
  DOMAINE_PERSONNALISE: "le nom de domaine personnalisé",
  ACOMPTE_EN_LIGNE: "le paiement de l'acompte en ligne",
};

export function pageOuverte(profil: { fonctions?: string[] } | null | undefined, page: string): boolean {
  const requise = FONCTION_PAR_PAGE[page];
  return !requise || fonctionOuverte(profil, requise);
}
