import { IsEmail } from "class-validator";

export class MotDePasseOublieDto {
  @IsEmail({}, { message: "Saisissez une adresse e-mail valide." })
  email!: string;
}
