import { IsBoolean } from "class-validator";

export class ModifierReglagesDto {
  /** Le patron peut-il aussi réaliser les opérations du quotidien (réserver, check-in/out, facturer, caisse) ? */
  @IsBoolean({ message: "patronPeutOperer doit être vrai ou faux." })
  patronPeutOperer!: boolean;
}
