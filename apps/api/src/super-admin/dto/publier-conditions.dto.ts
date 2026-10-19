import { IsString, MaxLength, MinLength } from "class-validator";

export class PublierConditionsDto {
  @IsString()
  @MinLength(200, { message: "Le texte des conditions semble trop court (200 caractères minimum)." })
  @MaxLength(100_000, { message: "Le texte des conditions est trop long." })
  texte!: string;
}
