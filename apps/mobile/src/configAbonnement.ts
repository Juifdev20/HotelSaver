/**
 * Où le patron paie son abonnement depuis ce téléphone.
 *
 * `PAIEMENT_DANS_APPLICATION`
 *   `true`  : formulaire Mobile Money DANS l'application (écran « Abonnement » et écran d'abonnement expiré).
 *   `false` : l'application ne vend rien elle-même (règle de Google Play : les produits numériques achetés dans une application
 *             publiée sur le Play Store doivent passer par Google Play Billing, un paiement Mobile Money intégré peut être refusé).
 *             L'état de l'abonnement, les alertes et l'historique restent visibles, et le patron est dirigé vers le SITE HotelSaver
 *             (page « Payer mon abonnement », ouverte dans le navigateur du téléphone), l'application Windows ou le support WhatsApp.
 *
 * `AFFICHER_LIEN_PAIEMENT_SITE`
 *   Seulement utile quand `PAIEMENT_DANS_APPLICATION` est `false`. `true` : un bouton « Payer sur le site HotelSaver » ouvre la page de
 *   paiement du site. `false` : le bouton disparaît (au cas où Google Play refuserait un lien vers un paiement externe) ; il reste le
 *   texte, l'application Windows et le support WhatsApp. Il suffit de changer ces lignes puis de republier : aucun autre fichier à modifier.
 *
 * Décision actuelle (17/10/2026) : on GARDE le paiement dans l'application (`true`) et on le retirera (`false`) si Google Play nous le refuse ou nous taxe.
 */
export const PAIEMENT_DANS_APPLICATION = true;

export const AFFICHER_LIEN_PAIEMENT_SITE = true;

/** Adresse de la page de paiement du site si le serveur ne l'a pas (encore) donnée : `EXPO_PUBLIC_SITE_URL` (https), compilée dans l'application. */
export const URL_PAIEMENT_SITE_SECOURS: string | null = process.env.EXPO_PUBLIC_SITE_URL ? `${process.env.EXPO_PUBLIC_SITE_URL.replace(/\/+$/, "")}/payer` : null;

/** Texte affiché quand `PAIEMENT_DANS_APPLICATION` est `false`. */
export const TEXTE_RENOUVELER_AILLEURS =
  "Pour payer ou renouveler votre abonnement : utilisez le site HotelSaver (dans votre navigateur), l'application Windows (Paramètres → Abonnement) ou contactez le support HotelSaver.";
