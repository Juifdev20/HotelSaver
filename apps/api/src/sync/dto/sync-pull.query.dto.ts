import { IsDateString, IsOptional, IsString } from "class-validator";

export class SyncPullQueryDto {
  @IsDateString({}, { message: "depuis doit être une date ISO 8601 valide." })
  depuis!: string;

  /** Liste séparée par des virgules (ex: "Chambre,Reservation") ; absent = tous
   * les types que le rôle appelant a le droit de lire. */
  @IsOptional()
  @IsString()
  entites?: string;
}
