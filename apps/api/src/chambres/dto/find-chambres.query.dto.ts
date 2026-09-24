import { StatutChambre } from "@hotel-chicago/database";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class FindChambresQueryDto {
  @IsOptional()
  @IsEnum(StatutChambre)
  statut?: StatutChambre;

  @IsOptional()
  @IsString()
  type?: string;
}
