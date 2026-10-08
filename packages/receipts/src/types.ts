/**
 * Modèle de reçu indépendant de toute imprimante (section 11.2/11.3) — un
 * seul endroit construit cette structure à partir des données métier ;
 * chaque plateforme la traduit vers son imprimante réelle (voir
 * `esc-pos.ts` pour mobile, `node-thermal-printer` directement côté
 * desktop).
 */
export type LigneRecu =
  /** En-tête centré et en gras (nom de l'hôtel). */
  | { type: "titre"; texte: string }
  /** Ligne centrée, poids normal (adresse, "Merci de votre visite !"). */
  | { type: "soustitre"; texte: string }
  /** Ligne de tirets pleine largeur. */
  | { type: "separateur" }
  /** "label : valeur" sur une seule ligne alignée à gauche (métadonnées :
   * numéro de reçu, date, client, chambre...). */
  | { type: "champ"; label: string; valeur: string }
  /** Libellé à gauche, montant aligné à droite (colonnes tabulaires —
   * prix, acompte, consommations, totaux, règlement, monnaie). */
  | { type: "montant"; libelle: string; valeur: string }
  /** Code-barres centré dessiné par l'imprimante (EAN-13 si 13 chiffres
   * valides, sinon Code128) — étiquettes d'articles (08/10/2026). */
  | { type: "codebarre"; valeur: string };
