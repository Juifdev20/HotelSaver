import { Type } from "class-transformer";
import { IsArray, IsEnum, IsOptional, IsPositive, IsUUID, ValidateNested } from "class-validator";
import { Devise } from "@hotel-chicago/database";

export class ItemMenuDuJourDto {
  @IsUUID("4", { message: "produitId doit être un UUID valide." })
  produitId!: string;

  @IsOptional()
  @IsPositive({ message: "Le prix spécial doit être positif." })
  prixSpecial?: number;

  @IsOptional()
  @IsEnum(Devise, { message: "deviseSpeciale doit être USD ou CDF." })
  deviseSpeciale?: Devise;
}

export class DefinirMenuDuJourDto {
  @IsArray({ message: "items doit être un tableau." })
  @ValidateNested({ each: true })
  @Type(() => ItemMenuDuJourDto)
  items!: ItemMenuDuJourDto[];
}
