import { IsDateString, IsOptional } from "class-validator";

export class FindChambresDisponiblesQueryDto {
  @IsOptional()
  @IsDateString()
  dateArrivee?: string;

  @IsOptional()
  @IsDateString()
  dateDepart?: string;
}
