import { IsOptional, IsString, MinLength } from "class-validator";

/** Super-admin → compte patron d'un hôtel (15/10/2026) : poser son numéro de
 * connexion (comptes antérieurs à la connexion par numéro) et/ou
 * réinitialiser son mot de passe quand il l'a oublié sans e-mail. */
export class ModifierPatronDto {
  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: "Le mot de passe doit contenir au moins 8 caractères." })
  motDePasse?: string;
}
