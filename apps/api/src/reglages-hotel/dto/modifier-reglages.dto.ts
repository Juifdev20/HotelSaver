import { IsBoolean, IsOptional } from "class-validator";

export class ModifierReglagesDto {
  /** Le patron peut-il aussi réaliser les opérations du quotidien (réserver, check-in/out, facturer, caisse) ? */
  @IsBoolean({ message: "patronPeutOperer doit être vrai ou faux." })
  @IsOptional()
  patronPeutOperer?: boolean;

  /** File de production cuisine active (écran Cuisine, cycle EN_ATTENTE → SERVI) ?
   * false = vente au comptoir : les lignes sont servies dès la vente. */
  @IsBoolean({ message: "cuisineActivee doit être vrai ou faux." })
  @IsOptional()
  cuisineActivee?: boolean;

  /** Onglet « Cuisine » sur le site public : les clients peuvent commander en
   * ligne (produits commandableEnLigne) et la cafétéria est notifiée. */
  @IsBoolean({ message: "commandeWebActivee doit être vrai ou faux." })
  @IsOptional()
  commandeWebActivee?: boolean;
}
