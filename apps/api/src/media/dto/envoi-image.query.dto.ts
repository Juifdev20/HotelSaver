import { IsIn } from "class-validator";
import type { UsageImage } from "../traiter-image";

export class EnvoiImageQueryDto {
  @IsIn(["chambre", "couverture", "galerie"], { message: "usage doit valoir chambre, couverture ou galerie." })
  usage!: UsageImage;
}
