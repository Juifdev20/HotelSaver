import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MinLength } from "class-validator";

export class InscriptionHotelDto {
  @IsString()
  @IsNotEmpty({ message: "Le nom de l'hôtel est obligatoire." })
  nom!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: "Le sous-domaine ne doit contenir que des minuscules, chiffres et tirets.",
  })
  sousDomaine!: string;

  @IsString()
  @IsNotEmpty({ message: "Le nom du propriétaire est obligatoire." })
  nomProprietaire!: string;

  /** Numéro du patron : identifiant de connexion (15/10/2026). Normalisé
   * côté service (telephoneObligatoire) — toute saisie RDC raisonnable est acceptée. */
  @IsString()
  @IsNotEmpty({ message: "Le numéro de téléphone est obligatoire." })
  telephoneProprietaire!: string;

  /** Optionnel depuis le 15/10/2026 : ne sert qu'à « mot de passe oublié ». */
  @IsOptional()
  @IsEmail({}, { message: "L'email doit être une adresse valide." })
  email?: string;

  @IsString()
  @MinLength(8, { message: "Le mot de passe doit contenir au moins 8 caractères." })
  motDePasse!: string;

  @IsOptional()
  @IsString()
  telephoneContact?: string;

  @IsOptional()
  @IsString()
  adresse?: string;

  @IsOptional()
  @IsUrl({}, { message: "logoUrl doit être une URL valide (Supabase Storage)." })
  logoUrl?: string;
}
