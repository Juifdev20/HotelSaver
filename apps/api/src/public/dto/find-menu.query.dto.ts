import { IsNotEmpty, IsString } from "class-validator";

export class FindMenuQueryDto {
  @IsString()
  @IsNotEmpty({ message: "sousDomaine est obligatoire." })
  sousDomaine!: string;
}
