import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { TypeGuide } from "@hotel-chicago/types";
import { TYPES_GUIDE } from "../guides.service";

export class PreparerEnvoiGuideDto {
  @IsIn(TYPES_GUIDE, { message: "Guide inconnu." })
  guide!: TypeGuide;
}

export class PublierGuideDto {
  @IsIn(TYPES_GUIDE, { message: "Guide inconnu." })
  guide!: TypeGuide;

  @IsString()
  @MaxLength(200)
  chemin!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80, { message: "Le libellé de l'édition est trop long (80 caractères au plus)." })
  edition?: string;
}
