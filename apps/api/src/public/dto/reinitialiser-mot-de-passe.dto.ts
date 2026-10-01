import { IsNotEmpty, IsString, MinLength } from "class-validator";

export class ReinitialiserMotDePasseDto {
  /** Jeton d'accès reçu dans le lien de l'e-mail de récupération. */
  @IsString()
  @IsNotEmpty({ message: "Lien de réinitialisation invalide." })
  jeton!: string;

  @IsString()
  @MinLength(8, { message: "Le mot de passe doit contenir au moins 8 caractères." })
  motDePasse!: string;
}
