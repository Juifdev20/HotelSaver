import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from "class-validator";
import { Type } from "class-transformer";
import { IsInt } from "class-validator";

export class DemandePaiementAbonnementDto {
  /** MAINTENANCE : frais mensuels d'un hôtel qui a une licence (la formule est alors ignorée). */
  @IsOptional()
  @IsIn(["ABONNEMENT", "MAINTENANCE"], { message: "L'objet du paiement doit être ABONNEMENT ou MAINTENANCE." })
  objet?: "ABONNEMENT" | "MAINTENANCE";

  @ValidateIf((o) => o.objet !== "MAINTENANCE")
  @IsString()
  @MaxLength(40)
  formule!: string;

  @Type(() => Number)
  @IsInt({ message: "La durée doit être un nombre de mois." })
  mois!: number;

  @IsIn(["USD", "CDF"], { message: "La devise doit être USD ou CDF." })
  devise!: "USD" | "CDF";

  @IsIn(["VODACOM", "ORANGE", "AIRTEL", "AFRICELL"], { message: "Opérateur inconnu." })
  operateur!: "VODACOM" | "ORANGE" | "AIRTEL" | "AFRICELL";

  @IsString()
  @MaxLength(30)
  @Matches(/^[0-9+\s().-]{8,30}$/, { message: "Numéro de téléphone invalide." })
  telephone!: string;

  @IsUUID("4", { message: "La clé d'idempotence doit être un UUID." })
  cleIdempotence!: string;
}

export class ApercuAbonnementQueryDto {
  @IsOptional()
  @IsIn(["ABONNEMENT", "MAINTENANCE"])
  objet?: "ABONNEMENT" | "MAINTENANCE";

  @ValidateIf((o) => o.objet !== "MAINTENANCE")
  @IsString()
  @MaxLength(40)
  formule!: string;

  @Type(() => Number)
  @IsInt()
  mois!: number;

  @IsIn(["USD", "CDF"], { message: "La devise doit être USD ou CDF." })
  devise!: "USD" | "CDF";
}
