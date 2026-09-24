import { Devise } from "@hotel-chicago/database";
import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsPositive, IsString, IsUrl, Min } from "class-validator";

/**
 * `stockActuel` est volontairement absent : seul le module Stock peut changer
 * la quantité en stock, via un MouvementStock tracé (section 9.3, ligne "Stock").
 */
export class UpdateProduitDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nom?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  categorie?: string;

  @IsOptional()
  @Type(() => Number)
  @IsPositive({ message: "Le prix doit être un nombre positif." })
  prix?: number;

  @IsOptional()
  @IsEnum(Devise, { message: "La devise doit être USD ou CDF." })
  devise?: Devise;

  @IsOptional()
  @IsUrl(undefined, { message: "La photo doit être une URL valide (Supabase Storage)." })
  photo?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  seuilAlerte?: number;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}
