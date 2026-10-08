import { Devise, TypeProduit } from "@hotel-chicago/database";
import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, IsUrl, Min } from "class-validator";
import { ChampCodeBarres } from "./code-barres";

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

  /** PLAT = préparé (cuisine/site, sans stock compté) ; ARTICLE = comptoir stocké. */
  @IsOptional()
  @IsEnum(TypeProduit, { message: "Le type doit être ARTICLE ou PLAT." })
  typeProduit?: TypeProduit;

  /** null retire la photo du produit. */
  @IsOptional()
  @IsUrl(undefined, { message: "La photo doit être une URL valide (Supabase Storage)." })
  photo?: string | null;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  seuilAlerte?: number;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  @IsOptional()
  @Type(() => Number)
  @Min(0, { message: "Le prix d'achat ne peut pas être négatif." })
  prixAchat?: number;

  /** Visible et commandable sur le site public de l'hôtel (page « Cuisine »). */
  @IsOptional()
  @IsBoolean()
  commandableEnLigne?: boolean;

  /** Description affichée sur la page publique. */
  @IsOptional()
  @IsString()
  description?: string;

  /** PLAT : portions préparées restantes (décrémentées à la vente) ;
   * null = repasser en illimité. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Les portions disponibles doivent être un nombre entier." })
  @Min(0, { message: "Les portions disponibles ne peuvent pas être négatives." })
  portionsDisponibles?: number | null;

  /** ARTICLE seulement ; null = retirer le code. */
  @ChampCodeBarres()
  codeBarres?: string | null;
}
