import { IsEmail, IsNotEmpty, IsOptional, IsString } from "class-validator";

/** Client saisi directement dans le formulaire de réservation (nouveau client). */
export class ClientInlineDto {
  @IsString()
  @IsNotEmpty({ message: "Le nom du client est obligatoire." })
  nom!: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsEmail({}, { message: "L'adresse email du client n'est pas valide." })
  email?: string;

  /** Pièce d'identité — registre de police (souvent saisie à l'arrivée
   * express, quand le client est au comptoir). */
  @IsOptional()
  @IsString()
  typePiece?: string;

  @IsOptional()
  @IsString()
  numeroPiece?: string;
}
