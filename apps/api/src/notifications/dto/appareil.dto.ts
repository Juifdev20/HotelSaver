import { IsIn, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class EnregistrerAppareilDto {
  /** Jeton FCM du téléphone. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  jeton!: string;

  @IsIn(["android", "ios"])
  plateforme!: "android" | "ios";
}

export class RetirerAppareilDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  jeton!: string;
}