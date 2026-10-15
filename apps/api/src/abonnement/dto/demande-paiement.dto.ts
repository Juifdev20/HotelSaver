import { IsIn, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { Type } from "class-transformer";
import { IsInt } from "class-validator";

export class DemandePaiementAbonnementDto {
  @IsIn(["ESSENTIEL", "PRO", "PREMIUM"], { message: "Formule inconnue." })
  formule!: "ESSENTIEL" | "PRO" | "PREMIUM";

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
