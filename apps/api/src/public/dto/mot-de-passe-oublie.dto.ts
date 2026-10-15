import { IsEmail, IsOptional, IsString, ValidateIf } from "class-validator";

/** « Mot de passe oublié » (15/10/2026) : par numéro de téléphone (cas
 * normal) ou par e-mail (anciens comptes). L'un des deux est exigé par le
 * service. */
export class MotDePasseOublieDto {
  @IsOptional()
  @IsString()
  telephone?: string;

  @ValidateIf((o: MotDePasseOublieDto) => !o.telephone)
  @IsEmail({}, { message: "Saisissez un numéro de téléphone ou une adresse e-mail valide." })
  email?: string;
}
