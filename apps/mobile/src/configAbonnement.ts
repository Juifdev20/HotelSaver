/**
 * Paiement de l'abonnement DANS l'application (Mobile Money via ScanLinkPay).
 *
 * `true`  : le patron peut payer depuis ce téléphone (écran « Abonnement » et écran d'abonnement expiré).
 * `false` : les écrans masquent tout le formulaire de paiement et affichent à la place
 *           « Pour renouveler, utilisez l'application Windows (Paramètres → Abonnement) ou contactez le support HotelSaver. »
 *           L'état de l'abonnement, les alertes et l'historique restent visibles.
 *
 * À METTRE À `false` SI GOOGLE PLAY REFUSE l'application : ses règles de facturation des produits numériques peuvent
 * exiger Google Play Billing pour un abonnement logiciel acheté dans l'application, et refuser un paiement Mobile Money
 * intégré. Il suffit de changer cette ligne puis de republier : aucun autre fichier n'est à modifier.
 */
export const PAIEMENT_DANS_APPLICATION = true;

/** Texte affiché à la place du formulaire de paiement quand `PAIEMENT_DANS_APPLICATION` est `false`. */
export const TEXTE_RENOUVELER_AILLEURS =
  "Pour renouveler, utilisez l'application Windows (Paramètres → Abonnement) ou contactez le support HotelSaver.";
