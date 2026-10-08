import { IsIn, IsNumber, IsString, Length, Matches, Min } from "class-validator";

export const DEVISES_DEPENSE = ["USD", "CDF"] as const;

export class CreerDepenseDto {
  /** Jour de la dépense « AAAA-MM-JJ ». */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "La date doit être au format AAAA-MM-JJ." })
  date!: string;

  @IsString()
  @Length(3, 200, { message: "Le motif doit faire entre 3 et 200 caractères." })
  motif!: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Le montant doit être un nombre (2 décimales au plus)." })
  @Min(0.01, { message: "Le montant doit être supérieur à zéro." })
  montant!: number;

  @IsIn(DEVISES_DEPENSE, { message: "La devise doit être USD ou CDF." })
  devise!: (typeof DEVISES_DEPENSE)[number];
}
