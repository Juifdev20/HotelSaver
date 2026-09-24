import { Role } from "@hotel-chicago/types";

export type IdPage =
  | "tableau-de-bord"
  | "chambres"
  | "reservations"
  | "arrivees-departs"
  | "facturation"
  | "caisse"
  | "comptes-ouverts"
  | "menu"
  | "stock"
  | "utilisateurs"
  | "taux-de-change"
  | "parametres";

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
const PATRON = [Role.PATRON];

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
      { id: "reservations", libelle: "Réservations", libelleCourt: "Réserv.", roles: RECEPTION, disponible: false },
      { id: "arrivees-departs", libelle: "Arrivées et départs", libelleCourt: "Arrivées", roles: RECEPTION, disponible: false },
      { id: "facturation", libelle: "Facturation", libelleCourt: "Factures", roles: RECEPTION, disponible: false },
    ],
  },
  {
    titre: "Cafétaria",
    entrees: [
      { id: "caisse", libelle: "Caisse", libelleCourt: "Caisse", roles: CAFETARIA, disponible: false },
      { id: "comptes-ouverts", libelle: "Comptes ouverts", libelleCourt: "Comptes", roles: CAFETARIA, disponible: false },
      { id: "menu", libelle: "Menu", libelleCourt: "Menu", roles: CAFETARIA, disponible: false },
      { id: "stock", libelle: "Stock", libelleCourt: "Stock", roles: CAFETARIA, disponible: false },
    ],
  },
  {
    titre: "Administration",
    entrees: [
      { id: "utilisateurs", libelle: "Utilisateurs", libelleCourt: "Comptes", roles: PATRON, disponible: false },
      { id: "taux-de-change", libelle: "Taux de change", libelleCourt: "Taux", roles: PATRON, disponible: false },
    ],
  },
];

export function sectionsPourRole(role: Role): SectionNavigation[] {
  return SECTIONS.map((section) => ({
    ...section,
    entrees: section.entrees.filter((entree) => entree.roles.includes(role)),
  })).filter((section) => section.entrees.length > 0);
}

/** Barre du bas : les 4 premières entrées du rôle, les disponibles d'abord ; le reste va dans « Plus ». */
export function entreesBarreDuBas(role: Role): EntreeNavigation[] {
  const toutes = sectionsPourRole(role).flatMap((section) => section.entrees);
  return [...toutes.filter((e) => e.disponible), ...toutes.filter((e) => !e.disponible)].slice(0, 4);
}

export function libellePage(id: IdPage): string {
  if (id === "parametres") return "Paramètres";
  return SECTIONS.flatMap((s) => s.entrees).find((e) => e.id === id)?.libelle ?? "";
}
