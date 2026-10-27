import { IsOptional, IsString, MaxLength } from "class-validator";

export class CouperAlerteStockDto {
  /** Le produit dont on coupe l'alerte ; absent = toutes les alertes de stock. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  produitId?: string;
}
