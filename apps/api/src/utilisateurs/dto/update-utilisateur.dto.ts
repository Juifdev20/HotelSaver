import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from "class-validator";

/** Mise à jour d'un compte du personnel par le PATRON (Phase 16) : nom,
 * email, mot de passe et actif sont tous optionnels — le service exige au
 * moins un champ renseigné. Email/mot de passe passent aussi par Supabase
 * Auth (mettreAJourCompte) : c'est le canal de rotation des identifiants
 * quand un employé part, le compte de rôle restant unique par hôtel. */
export class UpdateUtilisateurDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsEmail({}, { message: "L'email doit être une adresse valide." })
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: "Le mot de passe doit contenir au moins 8 caractères." })
  motDePasse?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}
