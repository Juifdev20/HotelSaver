import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";
import { ClientInlineDto } from "./client-inline.dto";

export class CreateReservationDto {
  @IsUUID(undefined, { message: "chambreId doit être un identifiant valide." })
  chambreId!: string;

  /** Fournir soit clientId (client existant), soit client (nouveau), jamais les deux. */
  @IsOptional()
  @IsUUID(undefined, { message: "clientId doit être un identifiant valide." })
  clientId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ClientInlineDto)
  client?: ClientInlineDto;

  @IsDateString({}, { message: "dateArrivee doit être une date valide (ISO 8601)." })
  dateArrivee!: string;

  @IsDateString({}, { message: "dateDepart doit être une date valide (ISO 8601)." })
  dateDepart!: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0, { message: "L'acompte ne peut pas être négatif." })
  acompte?: number;

  @IsOptional()
  @IsString()
  note?: string;

  /** Arrivée express (walk-in) : la réservation est créée puis passée en
   * EN_COURS dans la même opération (la chambre devient OCCUPEE) — le client
   * est déjà au comptoir, pas besoin du cycle EN_ATTENTE → CONFIRMEE. */
  @IsOptional()
  @IsBoolean()
  installerImmediatement?: boolean;
}
