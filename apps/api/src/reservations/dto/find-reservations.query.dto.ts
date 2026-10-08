import { IsDateString, IsIn, IsOptional, IsUUID } from "class-validator";

const STATUTS_VALIDES = ["EN_ATTENTE", "CONFIRMEE", "EN_COURS", "TERMINEE", "ANNULEE"] as const;

export class FindReservationsQueryDto {
  @IsOptional()
  @IsIn(STATUTS_VALIDES, { message: `statut doit être l'un de : ${STATUTS_VALIDES.join(", ")}.` })
  statut?: (typeof STATUTS_VALIDES)[number];

  @IsOptional()
  @IsUUID()
  chambreId?: string;

  /** Plage pour le planning : réservations qui chevauchent [du, au)
   * (dateArrivee < au && dateDepart > du). */
  @IsOptional()
  @IsDateString({}, { message: "du doit être une date valide (ISO 8601)." })
  du?: string;

  @IsOptional()
  @IsDateString({}, { message: "au doit être une date valide (ISO 8601)." })
  au?: string;
}
