import { Devise, TypeProduit } from "@hotel-chicago/database";
import { Type } from "class-transformer";
import { ChampCodeBarres } from "./code-barres";
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, IsUrl, Min } from "class-validator";

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

  /** PLAT = préparé en cuisine (photo/description, publiable sur le site, sans
   * stock compté) ; ARTICLE = produit de comptoir stocké (défaut). */
  @IsOptional()
  @IsEnum(TypeProduit, { message: "Le type doit être ARTICLE ou PLAT." })
  typeProduit?: TypeProduit;

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

  @IsOptional()
  @Type(() => Number)
  @Min(0, { message: "Le prix d'achat ne peut pas être négatif." })
  prixAchat?: number;

  /** Visible et commandable sur le site public de l'hôtel (page « Cuisine »,
   * si l'hôtel a activé commandeWebActivee). false = comptoir uniquement. */
  @IsOptional()
  @IsBoolean()
  commandableEnLigne?: boolean;

  /** Description affichée sur la page publique (ingrédients, format…). */
  @IsOptional()
  @IsString()
  description?: string;

  /** PLAT uniquement : nombre de portions préparées pouvant être vendues.
   * Absent = illimité (cuisine à la commande) ; décrémenté à chaque vente. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Les portions disponibles doivent être un nombre entier." })
  @Min(0, { message: "Les portions disponibles ne peuvent pas être négatives." })
  portionsDisponibles?: number;

  /** ARTICLE seulement : code du fabricant ou EAN-13 interne (préfixe 2). */
  @ChampCodeBarres()
  codeBarres?: string;
}
