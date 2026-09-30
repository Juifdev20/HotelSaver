import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";

/** Icônes proposées au patron — doit rester synchronisé avec
 * `ICONES_SERVICE` de packages/types (et avec le site web). */
export const ICONES_SERVICE = [
  "restaurant",
  "piscine",
  "wifi",
  "parking",
  "navette",
  "climatisation",
  "salle-conference",
  "bar",
  "spa",
  "securite",
  "blanchisserie",
  "petit-dejeuner",
  "autre",
] as const;

export class ServiceHotelDto {
  @IsIn(ICONES_SERVICE as unknown as string[])
  icone!: (typeof ICONES_SERVICE)[number];

  @IsString()
  @IsNotEmpty({ message: "Le titre d'un service est obligatoire." })
  @MaxLength(60)
  titre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class ModifierSiteDto {
  // --- Coordonnées : stockées sur Hotel ---
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  adresse?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telephoneContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  emailContact?: string;

  // --- Contenu du site : stocké sur HotelSite ---
  @IsOptional()
  @IsString()
  @MaxLength(120)
  slogan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  presentation?: string;

  /** `null` = retirer la photo de couverture. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  couvertureUrl?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6, { message: "La galerie est limitée à 6 photos." })
  @IsUrl({ require_tld: false }, { each: true })
  galerie?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: "12 services au maximum." })
  @ValidateNested({ each: true })
  @Type(() => ServiceHotelDto)
  services?: ServiceHotelDto[];

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "L'heure doit être au format HH:MM." })
  horaireArrivee?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "L'heure doit être au format HH:MM." })
  horaireDepart?: string;

  @IsOptional()
  @IsBoolean()
  reception24h?: boolean;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: "Le lien de la carte doit être une URL." })
  lienCarte?: string;

  /** { facebook?, instagram?, tiktok?, youtube?, x? } — valeurs = URLs. */
  @IsOptional()
  @IsObject()
  reseaux?: Record<string, string>;
}
