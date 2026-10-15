import { Role } from "@hotel-chicago/types";
import { fonctionOuverte, type CodeFonction } from "./fonctions";

/** Onglets du bas, filtrés par rôle — même matrice 9.3 que le desktop
 * (`apps/desktop/src/renderer/src/navigation.ts`), et même principe de 4
 * icônes par rôle que la maquette mobile : RECEPTIONNISTE/PATRON gardent
 * Accueil/Chambres/Réserv./Plus, CAFETARIA a Accueil/Caisse/Comptes/Plus —
 * les deux actions utilisées en continu (ouvrir une vente, reprendre un
 * compte) en onglet direct, Menu/Stock (consultés occasionnellement)
 * restent dans "Plus" (retour du patron, 28/09/2026). */
export type IdOnglet = "tableau-de-bord" | "chambres" | "reservations" | "caisse" | "comptes-ouverts" | "depenses" | "plus";

export interface OngletNavigation {
  id: IdOnglet;
  libelle: string;
  roles: Role[];
  /** false = écran pas encore construit, affiché « Bientôt » — jamais un onglet muet. */
  disponible: boolean;
}

const TOUS = [Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON];
const RECEPTION = [Role.RECEPTIONNISTE, Role.PATRON];

export const ONGLETS: OngletNavigation[] = [
  { id: "tableau-de-bord", libelle: "Accueil", roles: TOUS, disponible: true },
  { id: "chambres", libelle: "Chambres", roles: RECEPTION, disponible: true },
  { id: "reservations", libelle: "Réserv.", roles: RECEPTION, disponible: true },
  { id: "caisse", libelle: "Caisse", roles: [Role.CAFETARIA], disponible: true },
  { id: "comptes-ouverts", libelle: "Comptes", roles: [Role.CAFETARIA], disponible: true },
  // Dépenses (07/10/2026) : saisies par la réception et la cafétaria ; le
  // patron, qui ne les saisit pas, les consulte depuis « Plus ».
  { id: "depenses", libelle: "Dépenses", roles: [Role.RECEPTIONNISTE, Role.CAFETARIA], disponible: true },
  { id: "plus", libelle: "Plus", roles: TOUS, disponible: true },
];

/** Fonction d'abonnement dont dépend chaque écran (onglet, entrée de « Plus » ou vue). Absent = toujours disponible. « AU_MOINS_UNE » = écran partagé
 * entre les deux services (journal des reçus, rapports) : utile tant qu'au moins une des fonctions de SON rôle est ouverte. */
const FONCTION_PAR_ECRAN: Record<string, CodeFonction | "AU_MOINS_UNE"> = {
  // Réception
  chambres: "RECEPTION",
  reservations: "RECEPTION",
  "arrivees-departs": "RECEPTION",
  planning: "RECEPTION",
  "journal-journee": "RECEPTION",
  clients: "RECEPTION",
  remboursements: "RECEPTION",
  // Cafétaria
  caisse: "CAFETERIA",
  "comptes-ouverts": "CAFETERIA",
  "retrait-commande": "CAFETERIA",
  cuisine: "CAFETERIA",
  menu: "CAFETERIA",
  stock: "CAFETERIA",
  inventaire: "CAFETERIA",
  // Les deux services
  "journal-recus": "AU_MOINS_UNE",
  rapports: "AU_MOINS_UNE",
  // Site public
  "site-hotel": "SITE_PUBLIC",
};

/** Fonctions qui font le travail d'un rôle (le patron suit les deux services). */
export function fonctionsDuRole(role: Role): CodeFonction[] {
  return role === Role.PATRON ? ["RECEPTION", "CAFETERIA"] : role === Role.CAFETARIA ? ["CAFETERIA"] : ["RECEPTION"];
}

/** La fonction d'abonnement qui manque pour ouvrir cet écran (`null` = il est ouvert, ou ne dépend d'aucune fonction). `fonctions` absent = tout est ouvert. */
export function fonctionManquante(ecran: string, role: Role, fonctions: readonly string[] | undefined): CodeFonction | null {
  const requise = FONCTION_PAR_ECRAN[ecran];
  if (!requise) return null;
  if (requise === "AU_MOINS_UNE") {
    const utiles = fonctionsDuRole(role);
    return utiles.some((f) => fonctionOuverte(fonctions, f)) ? null : (utiles[0] ?? null);
  }
  return fonctionOuverte(fonctions, requise) ? null : requise;
}

/** Onglets du rôle, sans ceux que la formule de l'hôtel n'ouvre pas. « Accueil » et « Plus » ne dépendent d'aucune fonction : la barre n'est jamais vide. */
export function ongletsPourRole(role: Role, fonctions?: readonly string[]): OngletNavigation[] {
  return ONGLETS.filter((o) => o.roles.includes(role) && fonctionManquante(o.id, role, fonctions) === null);
}

export function libelleOnglet(id: IdOnglet): string {
  return ONGLETS.find((o) => o.id === id)?.libelle ?? "";
}

export const LIBELLE_ROLE: Record<Role, string> = {
  [Role.PATRON]: "Patron",
  [Role.RECEPTIONNISTE]: "Réceptionniste",
  [Role.CAFETARIA]: "Cafétaria",
};

/** Entrées qui n'ont pas leur propre onglet en bas (contrairement à Accueil,
 * Chambres, Réserv.) — affichées dans l'onglet "Plus", même répartition par
 * rôle et mêmes libellés que la barre latérale desktop
 * (`apps/desktop/src/renderer/src/navigation.ts`). Toutes "Bientôt" pour
 * l'instant, comme sur desktop : on les montre quand même pour que chaque
 * rôle (notamment CAFETARIA, qui n'a autrement aucun onglet dédié) voie que
 * son module existe. */
export interface EntreeMenuPlus {
  id: string;
  libelle: string;
  roles: Role[];
  /** false = affiché « Bientôt », comme `OngletNavigation.disponible`. */
  disponible: boolean;
}

export interface SectionMenuPlus {
  titre: string;
  entrees: EntreeMenuPlus[];
}

const CAFETARIA_ROLES = [Role.CAFETARIA, Role.PATRON];

export const SECTIONS_PLUS: SectionMenuPlus[] = [
  {
    // "Facturation" retirée d'ici : son contenu (facturer et check-out une
    // réservation) vit maintenant dans l'onglet "Réserv." — un deuxième
    // chemin vers le même endroit n'apporterait rien (même retour du
    // patron que pour le menu hamburger de EnteteMobile, 25/09/2026).
    titre: "Réception",
    entrees: [
      // Acomptes payés en ligne à rendre ou à garder (PATRON : c'est son argent).
      { id: "remboursements", libelle: "Remboursements", roles: [Role.PATRON], disponible: true },
      { id: "arrivees-departs", libelle: "Arrivées et départs", roles: RECEPTION, disponible: true },
      { id: "planning", libelle: "Planning", roles: RECEPTION, disponible: true },
      { id: "journal-journee", libelle: "Journal de la journée", roles: RECEPTION, disponible: true },
      { id: "clients", libelle: "Clients", roles: RECEPTION, disponible: true },
    ],
  },
  {
    titre: "Cafétaria",
    entrees: [
      // Caisse/Comptes ouverts ont leur propre onglet pour CAFETARIA (voir
      // ONGLETS ci-dessus) — inutile de les dupliquer ici pour ce rôle ;
      // PATRON, qui n'a pas ces onglets, les garde accessibles depuis Plus.
      { id: "caisse", libelle: "Caisse", roles: [Role.PATRON], disponible: true },
      { id: "comptes-ouverts", libelle: "Comptes ouverts", roles: [Role.PATRON], disponible: true },
      { id: "retrait-commande", libelle: "Retrait commande", roles: CAFETARIA_ROLES, disponible: true },
      { id: "cuisine", libelle: "Cuisine", roles: CAFETARIA_ROLES, disponible: true },
      { id: "menu", libelle: "Menu", roles: CAFETARIA_ROLES, disponible: true },
      { id: "stock", libelle: "Stock", roles: CAFETARIA_ROLES, disponible: true },
      { id: "inventaire", libelle: "Inventaire", roles: CAFETARIA_ROLES, disponible: true },
    ],
  },
  {
    // Un seul écran pour les deux métiers : les segments Séjours/Cafétaria
    // sont filtrés par rôle dans EcranJournalRecus (PATRON voit les deux).
    titre: "Reçus",
    entrees: [
      { id: "journal-recus", libelle: "Journal des reçus", roles: TOUS, disponible: true },
      // Rapports mensuels PDF : le personnel voit/génère son département,
      // le patron consulte les deux (filtrage dans EcranRapports + API).
      { id: "rapports", libelle: "Rapports mensuels", roles: TOUS, disponible: true },
      // Le personnel a l'onglet « Dépenses » ; le patron consulte ici.
      { id: "depenses", libelle: "Dépenses", roles: [Role.PATRON], disponible: true },
    ],
  },
  {
    // Comme sur desktop (EcranParametres) : Utilisateurs et Taux de change,
    // PATRON uniquement, matrice 9.3.
    titre: "Administration",
    entrees: [
      { id: "site-hotel", libelle: "Site de l'hôtel", roles: [Role.PATRON], disponible: true },
      { id: "utilisateurs", libelle: "Utilisateurs", roles: [Role.PATRON], disponible: true },
      { id: "taux-de-change", libelle: "Taux de change", roles: [Role.PATRON], disponible: true },
    ],
  },
  {
    // Visible par tous les rôles : l'état de l'abonnement concerne toute l'équipe ; seul le patron peut payer (voir EcranAbonnement).
    titre: "Abonnement",
    entrees: [{ id: "abonnement", libelle: "Abonnement", roles: TOUS, disponible: true }],
  },
];

/** `operer` = `peutOperer(utilisateur)` ; `cuisineActivee` = réglage hôtel
 * « suivi cuisine » (faux = vente au comptoir, l'écran Cuisine est masqué) ; `fonctions` = `utilisateur.fonctions` (entrées des fonctions fermées masquées). */
export function sectionsPlusPourRole(role: Role, operer = true, cuisineActivee = false, fonctions?: readonly string[]): SectionMenuPlus[] {
  return SECTIONS_PLUS.map((section) => ({
    ...section,
    entrees: section.entrees.filter(
      (entree) =>
        entree.roles.includes(role) &&
        (operer || entree.id !== "caisse") &&
        (cuisineActivee || entree.id !== "cuisine") &&
        fonctionManquante(entree.id, role, fonctions) === null
    ),
  })).filter((section) => section.entrees.length > 0);
}
