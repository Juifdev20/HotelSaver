import { IsIn } from "class-validator";
import type { UsageImage } from "../traiter-image";

export class EnvoiImageQueryDto {
  @IsIn(["chambre", "couverture", "galerie", "produit"], {
    message: "usage doit valoir chambre, couverture, galerie ou produit.",
  })
  usage!: UsageImage;
}
