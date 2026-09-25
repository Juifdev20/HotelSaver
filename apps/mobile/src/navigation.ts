import { Role } from "@hotel-chicago/types";

/** Onglets du bas, filtrés par rôle — même matrice 9.3 que le desktop
 * (`apps/desktop/src/renderer/src/navigation.ts`), et même répartition à 4
 * icônes que la maquette mobile (Accueil/Chambres/Réservations/Plus). */
export type IdOnglet = "tableau-de-bord" | "chambres" | "reservations" | "plus";

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
  { id: "reservations", libelle: "Réserv.", roles: RECEPTION, disponible: false },
  { id: "plus", libelle: "Plus", roles: TOUS, disponible: true },
];

export function ongletsPourRole(role: Role): OngletNavigation[] {
  return ONGLETS.filter((o) => o.roles.includes(role));
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
}

export interface SectionMenuPlus {
  titre: string;
  entrees: EntreeMenuPlus[];
}

const CAFETARIA_ROLES = [Role.CAFETARIA, Role.PATRON];

export const SECTIONS_PLUS: SectionMenuPlus[] = [
  {
    titre: "Réception",
    entrees: [
      { id: "arrivees-departs", libelle: "Arrivées et départs", roles: RECEPTION },
      { id: "facturation", libelle: "Facturation", roles: RECEPTION },
    ],
  },
  {
    titre: "Cafétaria",
    entrees: [
      { id: "caisse", libelle: "Caisse", roles: CAFETARIA_ROLES },
      { id: "comptes-ouverts", libelle: "Comptes ouverts", roles: CAFETARIA_ROLES },
      { id: "menu", libelle: "Menu", roles: CAFETARIA_ROLES },
      { id: "stock", libelle: "Stock", roles: CAFETARIA_ROLES },
    ],
  },
  {
    // Comme sur desktop (EcranParametres) : Utilisateurs et Taux de change,
    // PATRON uniquement, matrice 9.3.
    titre: "Administration",
    entrees: [
      { id: "utilisateurs", libelle: "Utilisateurs", roles: [Role.PATRON] },
      { id: "taux-de-change", libelle: "Taux de change", roles: [Role.PATRON] },
    ],
  },
];

export function sectionsPlusPourRole(role: Role): SectionMenuPlus[] {
  return SECTIONS_PLUS.map((section) => ({
    ...section,
    entrees: section.entrees.filter((entree) => entree.roles.includes(role)),
  })).filter((section) => section.entrees.length > 0);
}
