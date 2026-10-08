import { Type } from "class-transformer";
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from "class-validator";

export class ItemInventaireDto {
  @IsUUID()
  produitId!: string;

  @IsNumber()
  @Min(0)
  stockPhysique!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class LancerInventaireDto {
  @IsDateString()
  dateDebut!: string;

  @IsDateString()
  dateFin!: string;

  @IsOptional()
  @IsString()
  titre?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemInventaireDto)
  items!: ItemInventaireDto[];
}
