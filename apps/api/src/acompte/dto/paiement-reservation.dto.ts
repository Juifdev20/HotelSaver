import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";

/** Corps de POST /public/suivi/:jeton/paiement (aucun montant : le serveur le calcule). */
export class PayerAcompteDto {
  @IsString()
  @MaxLength(253)
  sousDomaine!: string;

  @IsIn(["MOBILE_MONEY", "CARTE"], { message: "Choisissez Mobile Money ou carte bancaire." })
  moyen!: "MOBILE_MONEY" | "CARTE";

  @IsOptional()
  @IsIn(["VODACOM", "ORANGE", "AIRTEL", "AFRICELL"], { message: "Opérateur inconnu." })
  operateur?: "VODACOM" | "ORANGE" | "AIRTEL" | "AFRICELL";

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\s().-]{8,30}$/, { message: "Numéro de téléphone invalide." })
  telephone?: string;

  /** Le numéro ScanLinkPay du client (SLP-…), pour être remboursé directement sur son compte. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{3,40}$/, { message: "Numéro ScanLinkPay invalide." })
  numeroScanLinkPay?: string;

  @IsOptional()
  @IsEmail({}, { message: "L'adresse email n'est pas valide." })
  @MaxLength(254)
  email?: string;

  @IsUUID("4", { message: "La clé d'idempotence doit être un UUID." })
  cleIdempotence!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}

/** Query de GET /public/suivi/:jeton/paiement/apercu. */
export class ApercuAcompteQueryDto {
  @IsString()
  @MaxLength(253)
  sousDomaine!: string;
}
