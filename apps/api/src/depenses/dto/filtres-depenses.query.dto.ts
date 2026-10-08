import { IsIn, IsOptional, Matches } from "class-validator";

export class FiltresDepensesQueryDto {
  /** « AAAA-MM-JJ » inclus. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "du doit être au format AAAA-MM-JJ." })
  du!: string;

  /** « AAAA-MM-JJ » inclus. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "au doit être au format AAAA-MM-JJ." })
  au!: string;

  /** Pris en compte pour le PATRON seulement ; le personnel voit son département. */
  @IsOptional()
  @IsIn(["CAFETERIA", "RECEPTION"], { message: "Le département doit être CAFETERIA ou RECEPTION." })
  departement?: "CAFETERIA" | "RECEPTION";
}
