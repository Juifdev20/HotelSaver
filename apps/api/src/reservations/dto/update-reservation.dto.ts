import { Type } from "class-transformer";
import { IsDateString, IsOptional, IsString, Min } from "class-validator";

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

  @IsOptional()
  @IsString()
  note?: string;

  /** Message visible par le client sur sa page de suivi — réponse à sa
   * demande avant confirmation (« acompte attendu à l'arrivée »…). */
  @IsOptional()
  @IsString()
  reponseReception?: string;
}
