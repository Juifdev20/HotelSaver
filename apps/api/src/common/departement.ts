import { Role } from "@hotel-chicago/types";

export type Departement = "CAFETERIA" | "RECEPTION";

const DEPARTEMENT_PAR_ROLE: Partial<Record<Role, Departement>> = {
  [Role.RECEPTIONNISTE]: "RECEPTION",
  [Role.CAFETARIA]: "CAFETERIA",
};

/** Département d'un membre du personnel (séparation des tâches) ; null pour
 * le PATRON, qui couvre les deux. Partagé par rapports et dépenses. */
export function departementDuRole(role: Role): Departement | null {
  return DEPARTEMENT_PAR_ROLE[role] ?? null;
}
