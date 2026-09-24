import { Type } from "class-transformer";
import { IsPositive, IsUUID } from "class-validator";

export class AjouterLigneDto {
  @IsUUID(undefined, { message: "sousCompteId doit être un identifiant valide." })
  sousCompteId!: string;

  @IsUUID(undefined, { message: "produitId doit être un identifiant valide." })
  produitId!: string;

  @Type(() => Number)
  @IsPositive({ message: "La quantité doit être positive." })
  quantite!: number;
}
