import { IsEmail, IsOptional, IsString } from "class-validator";

/** Fiche client : tous les champs facultatifs, seuls les présents sont modifiés. */
export class ModifierClientDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsEmail({}, { message: "L'adresse email du client n'est pas valide." })
  email?: string;

  @IsOptional()
  @IsString()
  typePiece?: string;

  @IsOptional()
  @IsString()
  numeroPiece?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
