import { Type } from "class-transformer";
import { IsDateString, IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";

class ClientDemandeDto {
  @IsString()
  @IsNotEmpty({ message: "Le nom est obligatoire." })
  nom!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "Un numéro de téléphone est recommandé pour vous recontacter." })
  telephone?: string;

  @IsOptional()
  @IsEmail({}, { message: "L'adresse email n'est pas valide." })
  email?: string;
}

/** Pré-réservation depuis le site public (section 8/9.3) : aucune authentification,
 * crée toujours une Reservation EN_ATTENTE, jamais confirmée directement. */
export class CreerDemandeReservationDto {
  @IsUUID(undefined, { message: "chambreId doit être un identifiant valide." })
  chambreId!: string;

  @ValidateNested()
  @Type(() => ClientDemandeDto)
  client!: ClientDemandeDto;

  @IsDateString({}, { message: "dateArrivee doit être une date valide (ISO 8601)." })
  dateArrivee!: string;

  @IsDateString({}, { message: "dateDepart doit être une date valide (ISO 8601)." })
  dateDepart!: string;
}
