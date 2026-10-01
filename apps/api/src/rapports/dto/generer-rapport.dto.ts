import { IsIn, Matches } from "class-validator";

export const DEPARTEMENTS_RAPPORT = ["CAFETERIA", "RECEPTION"] as const;
export type DepartementRapportDto = (typeof DEPARTEMENTS_RAPPORT)[number];

export class GenererRapportDto {
  @IsIn(DEPARTEMENTS_RAPPORT, { message: "Le département doit être CAFETERIA ou RECEPTION." })
  departement!: DepartementRapportDto;

  /** Mois « AAAA-MM » à Lubumbashi. */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "Le mois doit être au format AAAA-MM (ex. 2026-09)." })
  mois!: string;
}
