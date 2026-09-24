import { Devise } from "@hotel-chicago/database";
import { Type } from "class-transformer";
import { IsEnum, IsNotEmpty, IsOptional, IsPositive, IsString, IsUrl, Min } from "class-validator";

export class CreateProduitDto {
  @IsString()
  @IsNotEmpty({ message: "Le nom du produit est obligatoire." })
  nom!: string;

  @IsString()
  @IsNotEmpty({ message: "La catégorie est obligatoire (ex: Boissons, Plats, Snacks)." })
  categorie!: string;

  @Type(() => Number)
  @IsPositive({ message: "Le prix doit être un nombre positif." })
  prix!: number;

  @IsEnum(Devise, { message: "La devise doit être USD ou CDF." })
  devise!: Devise;

  @IsOptional()
  @IsUrl(undefined, { message: "La photo doit être une URL valide (Supabase Storage)." })
  photo?: string;

  /** Stock initial déclaré à la création — les changements ultérieurs passent
   * uniquement par le module Stock (voir StockModule), jamais par ce DTO. */
  @IsOptional()
  @Type(() => Number)
  @Min(0, { message: "Le stock initial ne peut pas être négatif." })
  stockActuel?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0, { message: "Le seuil d'alerte ne peut pas être négatif." })
  seuilAlerte?: number;
}
