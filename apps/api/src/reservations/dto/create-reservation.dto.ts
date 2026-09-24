import { Type } from "class-transformer";
import {
  IsDateString,
  IsOptional,
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
}
