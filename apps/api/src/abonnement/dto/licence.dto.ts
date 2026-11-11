import { Devise, MethodePaiementLicence } from "@hotel-chicago/database";
import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from "class-validator";
import { DUREES_LICENCE_ANNEES, MOIS_MAINTENANCE } from "@hotel-chicago/regles";

/** Activation d'une licence par le super-admin, après réception de l'argent en main propre. */
export class ActiverLicenceDto {
  @Type(() => Number)
  @IsInt()
  @IsIn(DUREES_LICENCE_ANNEES as readonly number[], { message: "La licence dure 1, 2 ou 3 ans." })
  annees!: number;

  /** Somme reçue : information seulement. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  montant?: number;

  @IsOptional()
  @IsEnum(Devise, { message: "La devise doit être USD ou CDF." })
  devise?: Devise;

  @IsOptional()
  @IsEnum(MethodePaiementLicence, { message: "methode doit être VIREMENT, MOBILE_MONEY, ESPECES ou AUTRE." })
  methode?: MethodePaiementLicence;

  /** Frais de maintenance mensuels propres à cet hôtel (dollars) ; absent ou null = réglage de la plateforme. */
  @IsOptional()
  @ValidateIf((o) => o.fraisMaintenanceUsd !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Les frais de maintenance doivent être un nombre (2 décimales au plus)." })
  @Min(0.5, { message: "Les frais de maintenance doivent être d'au moins 0,50 $ par mois." })
  @Max(10_000)
  fraisMaintenanceUsd?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/** Frais de maintenance reçus à la main (espèces, virement…) : `mois` périodes de 30 jours. */
export class EnregistrerMaintenanceDto {
  @Type(() => Number)
  @IsInt()
  @IsIn(MOIS_MAINTENANCE as readonly number[], { message: "La durée doit être de 1, 3, 6 ou 12 mois." })
  mois!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  montant!: number;

  @IsEnum(Devise, { message: "La devise doit être USD ou CDF." })
  devise!: Devise;

  @IsEnum(MethodePaiementLicence, { message: "methode doit être VIREMENT, MOBILE_MONEY, ESPECES ou AUTRE." })
  methode!: MethodePaiementLicence;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/** Le patron accepte le contrat de sa licence : il renvoie l'empreinte du texte qu'il vient de lire. */
export class AccepterContratDto {
  @IsUUID()
  licenceId!: string;

  @Matches(/^[0-9a-fA-F]{64}$/, { message: "Empreinte du contrat invalide : rouvrez le contrat puis acceptez." })
  empreinte!: string;
}
