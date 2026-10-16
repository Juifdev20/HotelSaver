import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class AnnulerVenteDto {
  @IsString()
  @IsNotEmpty({ message: "Le motif d'annulation est obligatoire (traçabilité, section 17)." })
  motif!: string;

  /** Remettre les articles du reçu en stock (défaut : oui). Non quand ils
   * ont été consommés ou cassés. */
  @IsOptional()
  @IsBoolean({ message: "remettreEnStock doit être vrai ou faux." })
  remettreEnStock?: boolean;
}
