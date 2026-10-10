import { IsString, MaxLength, MinLength } from "class-validator";

export class ChangerMotDePasseDto {
  @IsString()
  @MaxLength(128)
  motDePasseActuel!: string;

  @IsString()
  @MinLength(8, { message: "Le nouveau mot de passe doit contenir au moins 8 caractères." })
  @MaxLength(128)
  nouveauMotDePasse!: string;
}
