import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from "class-validator";

export class InscriptionHotelDto {
  @IsString()
  @IsNotEmpty({ message: "Le nom de l'hôtel est obligatoire." })
  @MaxLength(120)
  nom!: string;

  @IsString()
  @MaxLength(40, { message: "Le sous-domaine ne peut pas dépasser 40 caractères." })
  @Matches(/^[a-z0-9-]+$/, {
    message: "Le sous-domaine ne doit contenir que des minuscules, chiffres et tirets.",
  })
  sousDomaine!: string;

  @IsString()
  @IsNotEmpty({ message: "Le nom du propriétaire est obligatoire." })
  @MaxLength(120)
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
  @MaxLength(128)
  motDePasse!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telephoneContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  adresse?: string;

  @IsOptional()
  @IsUrl({}, { message: "logoUrl doit être une URL valide (Supabase Storage)." })
  @MaxLength(500)
  logoUrl?: string;

  /** Version des conditions d'utilisation acceptée (case cochée), 19/10/2026. Contrôlée par le service, avec un message
   * clair si elle manque (ancienne application sans la case). */
  @IsOptional()
  @IsInt({ message: "La version des conditions d'utilisation est invalide." })
  conditionsVersion?: number;

  /** Jeton du widget anti-robot (vérifié par CaptchaGuard, jamais enregistré). */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}
