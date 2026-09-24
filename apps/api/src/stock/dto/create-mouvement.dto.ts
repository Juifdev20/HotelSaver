import { Type } from "class-transformer";
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, NotEquals } from "class-validator";
import { TYPES_MOUVEMENT, TypeMouvement } from "../types-mouvement";

export class CreateMouvementDto {
  @IsUUID(undefined, { message: "produitId doit être un identifiant valide." })
  produitId!: string;

  @IsIn(TYPES_MOUVEMENT, { message: `type doit être l'un de : ${TYPES_MOUVEMENT.join(", ")}.` })
  type!: TypeMouvement;

  /**
   * ENTREE / SORTIE_VENTE / PERTE : quantité positive (le sens est déjà porté
   * par `type`). AJUSTEMENT : delta signé (positif = correction à la hausse,
   * négatif = à la baisse) — voir DECISIONS.md pour cette interprétation,
   * la section 7 ne précisant pas la convention de signe.
   */
  @Type(() => Number)
  @IsNumber()
  @NotEquals(0, { message: "La quantité ne peut pas être nulle." })
  quantite!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  motif?: string;
}
