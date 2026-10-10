import { Role } from "@hotel-chicago/types";

export type IdPage =
  | "tableau-de-bord"
  | "chambres"
  | "reservations"
  | "arrivees-departs"
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
  | "utilisateurs"
  | "site-hotel"
  | "rapports"
  | "depenses"
  | "synchronisation";

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
      { id: "reservations", libelle: "Réservations", libelleCourt: "Réserv.", roles: RECEPTION, disponible: true },
      { id: "arrivees-departs", libelle: "Arrivées et départs", libelleCourt: "Arrivées", roles: RECEPTION, disponible: true },
      { id: "journal-journee", libelle: "Journal de la journée", libelleCourt: "Journal", roles: RECEPTION, disponible: true },
      { id: "clients", libelle: "Clients", libelleCourt: "Clients", roles: RECEPTION, disponible: true },
      { id: "facturation", libelle: "Facturation", libelleCourt: "Factures", roles: RECEPTION, disponible: true },
    ],
  },
  {
    titre: "Cafétaria",
    entrees: [
      { id: "caisse", libelle: "Caisse", libelleCourt: "Caisse", roles: CAFETARIA, disponible: true },
      { id: "comptes-ouverts", libelle: "Comptes ouverts", libelleCourt: "Comptes", roles: CAFETARIA, disponible: true },
      { id: "retrait-commande", libelle: "Retrait commande", libelleCourt: "Retrait", roles: CAFETARIA, disponible: true },
      { id: "cuisine", libelle: "Cuisine", libelleCourt: "Cuisine", roles: CAFETARIA, disponible: true },
      { id: "menu", libelle: "Menu", libelleCourt: "Menu", roles: CAFETARIA, disponible: true },
      { id: "stock", libelle: "Stock", libelleCourt: "Stock", roles: CAFETARIA, disponible: true },
      { id: "inventaire", libelle: "Inventaire", libelleCourt: "Inventaire", roles: CAFETARIA, disponible: true },
    ],
  },
  {
    titre: "Rapports",
    entrees: [
      { id: "rapports", libelle: "Rapports mensuels", libelleCourt: "Rapports", roles: TOUS, disponible: true },
      // Dépenses (07/10/2026) : saisies par la réception et la cafétaria,
      // consultées par le patron (filtrage par rôle dans l'écran + l'API).
      { id: "depenses", libelle: "Dépenses", libelleCourt: "Dépenses", roles: TOUS, disponible: true },
    ],
  },
  {
    titre: "Mon hôtel",
    entrees: [{ id: "site-hotel", libelle: "Site de l'hôtel", libelleCourt: "Site", roles: [Role.PATRON], disponible: true }],
  },
  // Pas de section "Administration" séparée : Utilisateurs et Taux de change
  // (PATRON uniquement) vivent dans l'écran Paramètres pour garder la barre
  // latérale courte (demande du client du 25/09/2026).
];

/** Pages purement opérationnelles : le patron n'y a accès que s'il a le droit d'opérer (séparation des tâches). */
const PAGES_OPERATIONNELLES: IdPage[] = ["caisse"];

/** `operer` = `peutOperer(utilisateur)` : faux pour un patron dont l'hôtel n'a pas activé « le patron peut aussi opérer ». */
export function sectionsPourRole(role: Role, operer = true, cuisineActivee = false): SectionNavigation[] {
  return SECTIONS.map((section) => ({
    ...section,
    entrees: section.entrees.filter(
      (entree) =>
        entree.roles.includes(role) && (operer || !PAGES_OPERATIONNELLES.includes(entree.id)) && (cuisineActivee || entree.id !== "cuisine")
    ),
  })).filter((section) => section.entrees.length > 0);
}

/** Barre du bas : les 3 premières entrées du rôle (disponibles d'abord) + « Plus »
 * (ajouté par l'appelant) = 4 icônes au total, comme la maquette mobile. */
export function entreesBarreDuBas(role: Role, operer = true, cuisineActivee = false): EntreeNavigation[] {
  const toutes = sectionsPourRole(role, operer, cuisineActivee).flatMap((section) => section.entrees);
  return [...toutes.filter((e) => e.disponible), ...toutes.filter((e) => !e.disponible)].slice(0, 3);
}

export function libellePage(id: IdPage): string {
  if (id === "parametres") return "Paramètres";
  if (id === "imprimante") return "Imprimante";
  if (id === "utilisateurs") return "Utilisateurs";
  if (id === "synchronisation") return "Synchronisation";
  return SECTIONS.flatMap((s) => s.entrees).find((e) => e.id === id)?.libelle ?? "";
}
