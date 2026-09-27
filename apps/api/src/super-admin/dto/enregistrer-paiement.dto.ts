import { Devise, MethodePaiementLicence } from "@hotel-chicago/database";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsOptional, IsPositive, IsString } from "class-validator";

export class EnregistrerPaiementDto {
  @Type(() => Number)
  @IsPositive({ message: "Le montant doit être un nombre positif." })
  montant!: number;

  @IsEnum(Devise, { message: "La devise doit être USD ou CDF." })
  devise!: Devise;

  @IsEnum(MethodePaiementLicence, { message: "methode doit être VIREMENT, MOBILE_MONEY, ESPECES ou AUTRE." })
  methode!: MethodePaiementLicence;

  @IsDateString({}, { message: "periodeCouverteJusquau doit être une date valide (ISO 8601)." })
  periodeCouverteJusquau!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
