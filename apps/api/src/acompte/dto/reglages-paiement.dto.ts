import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from "class-validator";

export class ModifierReglagesPaiementDto {
  /** null = retirer le compte. */
  @IsOptional()
  @ValidateIf((o) => o.numeroScanLinkPay !== null)
  @IsString()
  @Matches(/^[A-Za-z0-9-]{3,40}$/, { message: "Numéro ScanLinkPay invalide (ex. SLP-000123)." })
  numeroScanLinkPay?: string | null;

  @IsOptional()
  @ValidateIf((o) => o.boutiqueScanLinkPayId !== null)
  @IsString()
  @MaxLength(80)
  boutiqueScanLinkPayId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Le pourcentage doit être un nombre entier." })
  @Min(0, { message: "Le pourcentage va de 0 à 100." })
  @Max(100, { message: "Le pourcentage va de 0 à 100." })
  pourcentageAcompte?: number;

  @IsOptional()
  @IsBoolean()
  fraisPayesParClient?: boolean;

  @IsOptional()
  @ValidateIf((o) => o.conditionsAnnulation !== null)
  @IsString()
  @MaxLength(1000)
  conditionsAnnulation?: string | null;
}

export class TraiterRemboursementDto {
  @Matches(/^(EFFECTUE|CONSERVE)$/, { message: "L'action doit être EFFECTUE ou CONSERVE." })
  action!: "EFFECTUE" | "CONSERVE";

  @IsOptional()
  @Type(() => Number)
  montant?: number;

  @IsOptional()
  @Matches(/^(SCANLINKPAY|MOBILE_MONEY|ESPECES|AUTRE)$/, { message: "Mode de remboursement inconnu." })
  mode?: "SCANLINKPAY" | "MOBILE_MONEY" | "ESPECES" | "AUTRE";

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
