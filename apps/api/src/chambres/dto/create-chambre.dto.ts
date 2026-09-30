import { Devise, StatutChambre } from "@hotel-chicago/database";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
} from "class-validator";

export class CreateChambreDto {
  @IsString()
  @IsNotEmpty({ message: "Le numéro de chambre est obligatoire." })
  numero!: string;

  @IsString()
  @IsNotEmpty({ message: "Le type de chambre est obligatoire." })
  type!: string;

  @Type(() => Number)
  @IsPositive({ message: "Le prix par nuit doit être un nombre positif." })
  prixParNuit!: number;

  @IsEnum(Devise, { message: "La devise doit être USD ou CDF." })
  devise!: Devise;

  @IsOptional()
  @IsEnum(StatutChambre)
  statut?: StatutChambre;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2, { message: "Une chambre accepte 2 photos au maximum." })
  @IsUrl({}, { each: true, message: "Chaque photo doit être une URL valide (Supabase Storage)." })
  photos?: string[];
}
