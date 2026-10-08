import { IsOptional, Matches, ValidateIf } from "class-validator";

/** EAN-8/13, UPC, ITF-14 (chiffres) ou Code128 alphanumérique — identifiant
 * seul, jamais le prix. Espaces retirés côté service avant enregistrement. */
export const MOTIF_CODE_BARRES = /^[0-9A-Za-z.\-]{4,32}$/;
export const MESSAGE_CODE_BARRES = "Le code-barres doit faire 4 à 32 caractères (chiffres, lettres, point ou tiret).";

/** Corps de PATCH /produits/:id/code-barres — null retire le code. */
export class AssocierCodeBarresDto {
  @ValidateIf((_, valeur) => valeur !== null)
  @Matches(MOTIF_CODE_BARRES, { message: MESSAGE_CODE_BARRES })
  codeBarres!: string | null;
}

/** Décorateurs du champ optionnel `codeBarres` des DTO produit. */
export function ChampCodeBarres(): PropertyDecorator {
  return (cible, cle) => {
    IsOptional()(cible, cle);
    Matches(MOTIF_CODE_BARRES, { message: MESSAGE_CODE_BARRES })(cible, cle);
  };
}
