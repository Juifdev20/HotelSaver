import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString } from "class-validator";

export class FindProduitsQueryDto {
  @IsOptional()
  @IsString()
  categorie?: string;

  // `Boolean("false")` vaut `true` en JS : une vraie conversion de chaîne de
  // requête ("true"/"false") est nécessaire, `@Type(() => Boolean)` ne suffit pas.
  @IsOptional()
  @Transform(({ value }) => value === "true")
  @IsBoolean()
  actif?: boolean;
}
