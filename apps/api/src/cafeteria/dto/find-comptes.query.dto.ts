import { StatutCompte } from "@hotel-chicago/database";
import { IsEnum, IsOptional } from "class-validator";

export class FindComptesQueryDto {
  @IsOptional()
  @IsEnum(StatutCompte)
  statut?: StatutCompte;
}
