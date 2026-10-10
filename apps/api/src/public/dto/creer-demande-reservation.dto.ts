import { Type } from "class-transformer";
import { IsDateString, IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from "class-validator";

class ClientDemandeDto {
  @IsString()
  @IsNotEmpty({ message: "Le nom est obligatoire." })
  @MaxLength(120)
  nom!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "Un numéro de téléphone est recommandé pour vous recontacter." })
  @MaxLength(30)
  telephone?: string;

  @IsOptional()
  @IsEmail({}, { message: "L'adresse email n'est pas valide." })
  @MaxLength(254)
  email?: string;
}

/** Pré-réservation depuis le site public (section 8/9.3) : aucune authentification,
 * crée toujours une Reservation EN_ATTENTE, jamais confirmée directement. */
export class CreerDemandeReservationDto {
  @IsString()
  @IsNotEmpty({ message: "sousDomaine est obligatoire." })
  sousDomaine!: string;

  @IsUUID(undefined, { message: "chambreId doit être un identifiant valide." })
  chambreId!: string;

  @ValidateNested()
  @Type(() => ClientDemandeDto)
  client!: ClientDemandeDto;

  @IsDateString({}, { message: "dateArrivee doit être une date valide (ISO 8601)." })
  dateArrivee!: string;

  @IsDateString({}, { message: "dateDepart doit être une date valide (ISO 8601)." })
  dateDepart!: string;

  /** Jeton du widget anti-robot (vérifié par CaptchaGuard, jamais enregistré). */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}
