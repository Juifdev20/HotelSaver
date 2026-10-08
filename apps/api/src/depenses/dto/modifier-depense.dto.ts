import { Equals, IsIn, IsNumber, IsOptional, IsString, Length, Matches, Min } from "class-validator";
import { DEVISES_DEPENSE } from "./creer-depense.dto";

export class ModifierDepenseDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "La date doit être au format AAAA-MM-JJ." })
  date?: string;

  @IsOptional()
  @IsString()
  @Length(3, 200, { message: "Le motif doit faire entre 3 et 200 caractères." })
  motif?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Le montant doit être un nombre (2 décimales au plus)." })
  @Min(0.01, { message: "Le montant doit être supérieur à zéro." })
  montant?: number;

  @IsOptional()
  @IsIn(DEVISES_DEPENSE, { message: "La devise doit être USD ou CDF." })
  devise?: (typeof DEVISES_DEPENSE)[number];

  /** Annulation tracée (jamais de suppression physique) — irréversible. */
  @IsOptional()
  @Equals(true, { message: "annulee ne peut valoir que true (une annulation est définitive)." })
  annulee?: true;
}
