import { Type } from "class-transformer";
import { IsPositive, Max, Min } from "class-validator";

export class CreateTauxChangeDto {
  /** 1 USD = cdfParUsd CDF (ex. 2800). */
  @Type(() => Number)
  @IsPositive({ message: "Le taux doit être strictement positif." })
  // Bornes plausibles (FC pour 1 $) : « 2.800 » lu 2,8 ou « 280000 » par erreur fausserait tous les paiements croisés.
  @Min(500, { message: "Le taux doit être d'au moins 500 FC pour 1 $." })
  @Max(20000, { message: "Le taux ne peut pas dépasser 20 000 FC pour 1 $." })
  cdfParUsd!: number;
}
