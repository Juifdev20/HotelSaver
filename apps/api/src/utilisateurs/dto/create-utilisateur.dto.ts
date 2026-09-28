import { Role } from "@hotel-chicago/types";
import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength } from "class-validator";

/** Création d'un compte employé par le PATRON (Phase 15) — même mot de passe
 * que celui communiqué à l'employé, pas de génération automatique (choix
 * validé avec le patron). `emailConfirme: true` côté service, comme
 * creer-utilisateur.js : un compte créé par un admin de confiance, pas une
 * inscription libre-service (voir PublicService.inscrireHotel). */
export class CreateUtilisateurDto {
  @IsString()
  @IsNotEmpty({ message: "Le nom est obligatoire." })
  nom!: string;

  @IsEmail({}, { message: "L'email doit être une adresse valide." })
  email!: string;

  @IsString()
  @MinLength(8, { message: "Le mot de passe doit contenir au moins 8 caractères." })
  motDePasse!: string;

  @IsEnum(Role, { message: "Le rôle doit être RECEPTIONNISTE, CAFETARIA ou PATRON." })
  role!: Role;
}
