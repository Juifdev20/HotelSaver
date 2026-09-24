import { IsNotEmpty, IsString } from "class-validator";

export class AnnulerReservationDto {
  @IsString()
  @IsNotEmpty({ message: "Le motif d'annulation est obligatoire (traçabilité, section 17)." })
  motif!: string;
}
