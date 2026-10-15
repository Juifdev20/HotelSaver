import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
import { FONCTIONS } from "@hotel-chicago/regles";

const MESSAGE_FONCTION = `Chaque fonction doit être l'une de : ${FONCTIONS.join(", ")}.`;

/** Création d'une formule d'abonnement (super-admin). */
export class CreerFormuleDto {
  @Matches(/^[A-Z][A-Z0-9_]{1,29}$/, { message: "Le code doit faire 2 à 30 caractères : lettres MAJUSCULES, chiffres ou _, en commençant par une lettre (ex. PRO)." })
  code!: string;

  @IsString()
  @MinLength(1, { message: "Le nom est obligatoire." })
  @MaxLength(40)
  nom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Le prix mensuel doit être un nombre (2 décimales au plus)." })
  @Min(0.5, { message: "Le prix mensuel doit être d'au moins 0,50 $." })
  @Max(100_000)
  prixMensuelUsd!: number;

  /** null / absent = chambres illimitées. */
  @IsOptional()
  @ValidateIf((o) => o.maxChambres !== null)
  @Type(() => Number)
  @IsInt({ message: "Le nombre maximal de chambres doit être un entier." })
  @Min(1)
  @Max(100_000)
  maxChambres?: number | null;

  @IsArray()
  @ArrayMinSize(1, { message: "Cochez au moins une fonction." })
  @ArrayMaxSize(FONCTIONS.length)
  @IsIn(FONCTIONS as readonly string[], { each: true, message: MESSAGE_FONCTION })
  fonctions!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  avantages?: string[];

  @IsOptional()
  @IsBoolean()
  recommandee?: boolean;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  ordre?: number;
}

/** Modification : tous les champs sont facultatifs, le code ne change jamais. */
export class ModifierFormuleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  nom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(100_000)
  prixMensuelUsd?: number;

  @IsOptional()
  @ValidateIf((o) => o.maxChambres !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  maxChambres?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: "Cochez au moins une fonction." })
  @IsIn(FONCTIONS as readonly string[], { each: true, message: MESSAGE_FONCTION })
  fonctions?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  avantages?: string[];

  @IsOptional()
  @IsBoolean()
  recommandee?: boolean;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  ordre?: number;
}

export class ModifierParametresDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Le taux doit être un nombre entier de francs pour 1 dollar." })
  @Min(500, { message: "Le taux doit être compris entre 500 et 20 000 FC pour 1 $." })
  @Max(20_000, { message: "Le taux doit être compris entre 500 et 20 000 FC pour 1 $." })
  tauxCdf?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6, { message: "Au plus 6 mois offerts pour un an." })
  moisOffertsAnnuel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  joursEssai?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  joursGrace?: number;

  @IsOptional()
  @IsArray()
  @IsIn(FONCTIONS as readonly string[], { each: true, message: MESSAGE_FONCTION })
  fonctionsEssai?: string[];

  @IsOptional()
  @IsBoolean()
  fraisAbonnementPayesParClient?: boolean;

  @IsOptional()
  @Matches(/^\+?[0-9 ]{8,20}$/, { message: "Numéro de téléphone invalide." })
  contactTelephone?: string;

  @IsOptional()
  @Matches(/^\+?[0-9 ]{8,20}$/, { message: "Numéro WhatsApp invalide." })
  contactWhatsapp?: string;
}

export class ChangerFormuleHotelDto {
  /** null = sans formule (essai, ou hôtel historique non restreint). */
  @ValidateIf((o) => o.formule !== null)
  @IsString()
  formule!: string | null;
}
