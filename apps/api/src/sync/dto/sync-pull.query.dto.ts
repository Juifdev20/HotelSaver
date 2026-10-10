import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class SyncPullQueryDto {
  @IsDateString({}, { message: "depuis doit être une date ISO 8601 valide." })
  depuis!: string;

  /** Liste séparée par des virgules (ex: "Chambre,Reservation") ; absent = tous
   * les types que le rôle appelant a le droit de lire. */
  @IsOptional()
  @IsString()
  entites?: string;

  /** Lignes maximum par type d'entité (défaut 1000) : après plusieurs jours hors ligne, la remise à niveau se fait par pages. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limite?: number;
}
