import { IsDateString, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class FindChambresDisponiblesQueryDto {
  @IsString()
  @IsNotEmpty({ message: "sousDomaine est obligatoire." })
  sousDomaine!: string;

  @IsOptional()
  @IsDateString()
  dateArrivee?: string;

  @IsOptional()
  @IsDateString()
  dateDepart?: string;
}
