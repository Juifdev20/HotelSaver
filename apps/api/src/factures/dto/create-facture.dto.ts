import { Devise, ModePaiement } from "@hotel-chicago/database";
import { Type } from "class-transformer";
import { IsEnum, IsOptional, IsPositive, IsUUID } from "class-validator";

export class CreateFactureDto {
  @IsUUID(undefined, { message: "reservationId doit être un identifiant valide." })
  reservationId!: string;

  @IsEnum(ModePaiement, { message: "modePaiement doit être CASH, MOBILE_MONEY ou FACTURE_CHAMBRE." })
  modePaiement!: ModePaiement;

  /** Paiement croisé (section 9.4) : devise réellement remise par le client, si différente du dû. */
  @IsOptional()
  @IsEnum(Devise)
  deviseRegleeParClient?: Devise;

  @IsOptional()
  @Type(() => Number)
  @IsPositive({ message: "Le montant remis doit être positif." })
  montantRegleParClient?: number;

  /** Devise choisie par le caissier pour rendre la monnaie (défaut : celle du règlement). */
  @IsOptional()
  @IsEnum(Devise)
  deviseRenduChoisie?: Devise;
}
