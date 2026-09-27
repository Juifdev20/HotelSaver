import { IsNotEmpty, IsString } from "class-validator";

export class FindHotelPublicQueryDto {
  @IsString()
  @IsNotEmpty({ message: "sousDomaine est obligatoire." })
  sousDomaine!: string;
}
