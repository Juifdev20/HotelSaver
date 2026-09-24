import { Devise, StatutChambre } from "@hotel-chicago/database";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
} from "class-validator";

/**
 * Tous les champs sont optionnels ici : c'est ChambresService.update() qui
 * décide, selon le rôle de l'appelant, quels champs présents sont réellement
 * autorisés (RECEPTIONNISTE : statut/photos uniquement — voir section 9.3,
 * "Statut chambre" vs "Chambres (types, prix)").
 */
export class UpdateChambreDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  numero?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsPositive({ message: "Le prix par nuit doit être un nombre positif." })
  prixParNuit?: number;

  @IsOptional()
  @IsEnum(Devise, { message: "La devise doit être USD ou CDF." })
  devise?: Devise;

  @IsOptional()
  @IsEnum(StatutChambre)
  statut?: StatutChambre;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUrl({}, { each: true, message: "Chaque photo doit être une URL valide (Supabase Storage)." })
  photos?: string[];
}
