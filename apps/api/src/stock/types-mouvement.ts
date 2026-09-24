/** Section 7 : MouvementStock.type est un champ String libre en base (pas un
 * enum Prisma), mais sa valeur doit toujours être l'une de celles-ci. */
export const TYPES_MOUVEMENT = ["ENTREE", "SORTIE_VENTE", "PERTE", "AJUSTEMENT"] as const;
export type TypeMouvement = (typeof TYPES_MOUVEMENT)[number];
