import { Type } from "class-transformer";
import { IsDateString, IsOptional, Min } from "class-validator";

export class UpdateReservationDto {
  @IsOptional()
  @IsDateString({}, { message: "dateArrivee doit être une date valide (ISO 8601)." })
  dateArrivee?: string;

  @IsOptional()
  @IsDateString({}, { message: "dateDepart doit être une date valide (ISO 8601)." })
  dateDepart?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0, { message: "L'acompte ne peut pas être négatif." })
  acompte?: number;
}
