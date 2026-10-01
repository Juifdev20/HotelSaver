import { Devise, ModePaiement } from "@hotel-chicago/database";
import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, IsPositive, IsUUID, Min } from "class-validator";

export const MODES_ENCAISSEMENT = ["GROUPE", "PAR_SOUS_COMPTE", "PARTAGE_EGAL", "UNE_PERSONNE"] as const;
export type ModeEncaissement = (typeof MODES_ENCAISSEMENT)[number];

export class EncaisserCompteDto {
  @IsIn(MODES_ENCAISSEMENT, { message: `mode doit être l'un de : ${MODES_ENCAISSEMENT.join(", ")}.` })
  mode!: ModeEncaissement;

  @IsEnum(ModePaiement, { message: "modePaiement doit être CASH, MOBILE_MONEY ou FACTURE_CHAMBRE." })
  modePaiement!: ModePaiement;

  /** Requis uniquement pour mode = UNE_PERSONNE : la personne (sous-compte) qui règle sa part. */
  @IsOptional()
  @IsUUID()
  sousCompteId?: string;

  /** Requis uniquement pour mode = PARTAGE_EGAL. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2, { message: "Un partage égal nécessite au moins 2 personnes." })
  nombrePersonnes?: number;

  /** Requis si modePaiement = FACTURE_CHAMBRE (section 9.2). */
  @IsOptional()
  @IsUUID()
  reservationLieeId?: string;

  /** Paiement croisé (section 9.4), appliqué uniformément à chaque vente générée
   * par cet encaissement — voir DECISIONS.md pour cette simplification. */
  @IsOptional()
  @IsEnum(Devise)
  deviseRegleeParClient?: Devise;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  montantRegleParClient?: number;

  @IsOptional()
  @IsEnum(Devise)
  deviseRenduChoisie?: Devise;
}
