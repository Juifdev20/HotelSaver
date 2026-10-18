import { IsString, MaxLength, MinLength } from "class-validator";

/** Annulation d'un paiement saisi à la main (17/10/2026) : motif obligatoire, gardé avec la ligne pour le contrôle. */
export class AnnulerPaiementDto {
  @IsString()
  @MinLength(5, { message: "Indiquez le motif de l'annulation (5 caractères au moins)." })
  @MaxLength(300)
  motif!: string;
}
