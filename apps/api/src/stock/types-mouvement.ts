/** Section 7 : MouvementStock.type est un champ String libre en base (pas un
 * enum Prisma), mais sa valeur doit toujours être l'une de celles-ci. */
export const TYPES_MOUVEMENT = ["ENTREE", "SORTIE_VENTE", "PERTE", "AJUSTEMENT"] as const;
export type TypeMouvement = (typeof TYPES_MOUVEMENT)[number];

/** Mouvement AUTOMATIQUE (jamais saisi à la main, donc absent de
 * TYPES_MOUVEMENT) : articles remis en stock à l'annulation d'un reçu
 * cafétaria (15/10/2026). Compte en + dans le stock et réduit les ventes
 * nettes de l'inventaire. */
export const TYPE_RETOUR_VENTE = "RETOUR_VENTE";
