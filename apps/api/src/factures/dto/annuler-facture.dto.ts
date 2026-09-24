import { IsNotEmpty, IsString } from "class-validator";

export class AnnulerFactureDto {
  @IsString()
  @IsNotEmpty({ message: "Le motif d'annulation est obligatoire (traçabilité comptable, section 17)." })
  motif!: string;
}
