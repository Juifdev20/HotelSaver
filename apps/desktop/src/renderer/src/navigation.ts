import { Role } from "@hotel-chicago/types";
import { pageOuverte } from "./fonctions";

export type IdPage =
  | "tableau-de-bord"
  | "chambres"
  | "reservations"
  | "remboursements"
  | "journal-journee"
  | "clients"
  | "facturation"
  | "caisse"
  | "comptes-ouverts"
  | "retrait-commande"
  | "cuisine"
  | "menu"
  | "stock"
  | "inventaire"
  | "parametres"
  | "imprimante"
  | "abonnement"
  | "utilisateurs"
  | "site-hotel"
  | "rapports"
  | "depenses"
  | "guides"
  | "synchronisation"
  | "taux-de-change";

export interface EntreeNavigation {
  id: IdPage;
  libelle: string;
  /** Libellé court pour la barre du bas (mobile / fenêtre étroite). */
  libelleCourt: string;
  roles: Role[];
  /** false = affiché grisé « Bientôt » (écran pas encore construit). */
  disponible: boolean;
}

export interface SectionNavigation {
  titre: string | null;
  entrees: EntreeNavigation[];
}

const TOUS = [Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON];
const RECEPTION = [Role.RECEPTIONNISTE, Role.PATRON];
const CAFETARIA = [Role.CAFETARIA, Role.PATRON];

/** Sections et droits calqués sur la matrice 9.3 (qui voit quoi). */
export const SECTIONS: SectionNavigation[] = [
  {
    titre: null,
    entrees: [{ id: "tableau-de-bord", libelle: "Tableau de bord", libelleCourt: "Accueil", roles: TOUS, disponible: true }],
  },
  {
    titre: "Réception",
    entrees: [
      { id: "chambres", libelle: "Chambres", libelleCourt: "Chambres", roles: RECEPTION, disponible: true },
      // « Séjours » (11/11/2026) remplace « Réservations » et « Arrivées et départs » : ce qu'il y a à faire aujourd'hui, et toutes les réservations.
      { id: "reservations", libelle: "Séjours", libelleCourt: "Séjours", roles: RECEPTION, disponible: true },
      { id: "clients", libelle: "Clients", libelleCourt: "Clients", roles: RECEPTION, disponible: true },
      { id: "facturation", libelle: "Facturation", libelleCourt: "Factures", roles: RECEPTION, disponible: true },
      { id: "journal-journee", libelle: "Journal du jour", libelleCourt: "Journal", roles: RECEPTION, disponible: true },
      // Acomptes payés en ligne à rendre ou à garder : c'est l'argent du patron, lui seul décide (pastille « à faire » dans la barre).
      { id: "remboursements", libelle: "Remboursements", libelleCourt: "Rembours.", roles: [Role.PATRON], disponible: true },
    ],
  },
  {
    titre: "Cafétéria",
    // 12/11/2026 : « Cuisine » et « Retrait commande » vivent dans « En cours » (onglet / bouton), « Inventaire » dans « Stock »,
    // et « Menu » s'appelle « Produits » (articles en stock + plats préparés). Les identifiants de page restent valides (anciens liens).
    entrees: [
      { id: "caisse", libelle: "Vente", libelleCourt: "Vente", roles: CAFETARIA, disponible: true },
      { id: "comptes-ouverts", libelle: "En cours", libelleCourt: "En cours", roles: CAFETARIA, disponible: true },
      { id: "menu", libelle: "Produits", libelleCourt: "Produits", roles: CAFETARIA, disponible: true },
      { id: "stock", libelle: "Stock", libelleCourt: "Stock", roles: CAFETARIA, disponible: true },
    ],
  },
  {
    titre: "Argent",
    entrees: [
      { id: "rapports", libelle: "Rapports", libelleCourt: "Rapports", roles: TOUS, disponible: true },
      // Dépenses (07/10/2026) : saisies par la réception et la cafétaria,
      // consultées par le patron (filtrage par rôle dans l'écran + l'API).
      { id: "depenses", libelle: "Dépenses", libelleCourt: "Dépenses", roles: TOUS, disponible: true },
      { id: "taux-de-change", libelle: "Taux de change", libelleCourt: "Taux", roles: [Role.PATRON], disponible: true },
    ],
  },
  {
    titre: "Mon hôtel",
    entrees: [
      { id: "site-hotel", libelle: "Site de l'hôtel", libelleCourt: "Site", roles: [Role.PATRON], disponible: true },
      { id: "utilisateurs", libelle: "Utilisateurs", libelleCourt: "Utilisateurs", roles: [Role.PATRON], disponible: true },
    ],
  },
  // « Réglages » (ex-Paramètres + Guide + À propos) a sa propre entrée en bas de la barre (voir la Coquille), pas de section « Aide ».
];

/** Anciennes pages devenues des onglets : la page de la barre qui les contient. */
export function pageDeLaBarre(id: IdPage): IdPage {
  if (id === "cuisine" || id === "retrait-commande") return "comptes-ouverts";
  if (id === "inventaire") return "stock";
  if (id === "guides" || id === "imprimante" || id === "synchronisation") return "parametres";
  return id;
}

/** Pages purement opérationnelles : le patron n'y a accès que s'il a le droit d'opérer (séparation des tâches). */
const PAGES_OPERATIONNELLES: IdPage[] = ["caisse"];

/**
 * `operer` = `peutOperer(utilisateur)` : faux pour un patron dont l'hôtel n'a pas activé « le patron peut aussi opérer ».
 * `fonctions` = `profil.fonctions` : ce que la formule de l'hôtel ouvre (absent = tout). Un écran d'une fonction non incluse n'est pas proposé.
 */
export function sectionsPourRole(role: Role, operer = true, cuisineActivee = false, fonctions?: string[]): SectionNavigation[] {
  return SECTIONS.map((section) => ({
    ...section,
    entrees: section.entrees.filter(
      (entree) =>
        entree.roles.includes(role) &&
        (operer || !PAGES_OPERATIONNELLES.includes(entree.id)) &&
        (cuisineActivee || entree.id !== "cuisine") &&
        pageOuverte({ fonctions }, entree.id)
    ),
  })).filter((section) => section.entrees.length > 0);
}

/** Barre du bas : les 3 premières entrées du rôle (disponibles d'abord) + « Plus »
 * (ajouté par l'appelant) = 4 icônes au total, comme la maquette mobile. */
export function entreesBarreDuBas(role: Role, operer = true, cuisineActivee = false, fonctions?: string[]): EntreeNavigation[] {
  const toutes = sectionsPourRole(role, operer, cuisineActivee, fonctions).flatMap((section) => section.entrees);
  return [...toutes.filter((e) => e.disponible), ...toutes.filter((e) => !e.disponible)].slice(0, 3);
}

export function libellePage(id: IdPage): string {
  if (id === "parametres") return "Réglages";
  if (id === "taux-de-change") return "Taux de change";
  if (id === "cuisine") return "Cuisine";
  if (id === "retrait-commande") return "Retrait commande";
  if (id === "inventaire") return "Inventaire";
  if (id === "guides") return "Guide d'utilisation";
  if (id === "imprimante") return "Imprimante";
  if (id === "utilisateurs") return "Utilisateurs";
  if (id === "synchronisation") return "Synchronisation";
  if (id === "abonnement") return "Abonnement";
  return SECTIONS.flatMap((s) => s.entrees).find((e) => e.id === id)?.libelle ?? "";
}
