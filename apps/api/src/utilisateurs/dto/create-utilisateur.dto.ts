import { Role } from "@hotel-chicago/types";
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength, ValidateIf } from "class-validator";

/** Création d'un compte employé par le PATRON (Phase 15) — même mot de passe
 * que celui communiqué à l'employé, pas de génération automatique (choix
 * validé avec le patron). Depuis le 15/10/2026, le **numéro de téléphone**
 * est l'identifiant de connexion (obligatoire, normalisé côté service) et
 * l'e-mail est optionnel. */
export class CreateUtilisateurDto {
  @IsString()
  @IsNotEmpty({ message: "Le nom est obligatoire." })
  nom!: string;

  @IsString()
  @IsNotEmpty({ message: "Le numéro de téléphone est obligatoire." })
  telephone!: string;

  @IsOptional()
  @ValidateIf((o: CreateUtilisateurDto) => o.email !== "")
  @IsEmail({}, { message: "L'email doit être une adresse valide." })
  email?: string;

  @IsString()
  @MinLength(8, { message: "Le mot de passe doit contenir au moins 8 caractères." })
  motDePasse!: string;

  @IsEnum(Role, { message: "Le rôle doit être RECEPTIONNISTE, CAFETARIA ou PATRON." })
  role!: Role;
}
