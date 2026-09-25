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
