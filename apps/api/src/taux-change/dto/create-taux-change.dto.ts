import { Type } from "class-transformer";
import { IsPositive } from "class-validator";

export class CreateTauxChangeDto {
  /** 1 USD = cdfParUsd CDF (ex. 2800). */
  @Type(() => Number)
  @IsPositive({ message: "Le taux doit être strictement positif." })
  cdfParUsd!: number;
}
