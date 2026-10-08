import { IsEnum } from "class-validator";

export enum StatutLigneDto {
  EN_PREPARATION = "EN_PREPARATION",
  PRET           = "PRET",
  SERVI          = "SERVI",
}

export class MajStatutLigneDto {
  @IsEnum(StatutLigneDto, { message: "Statut invalide. Valeurs acceptées : EN_PREPARATION, PRET, SERVI." })
  statut!: StatutLigneDto;
}
