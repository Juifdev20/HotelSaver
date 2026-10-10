import { ThrottlerModuleOptions } from "@nestjs/throttler";

/** 1 minute, en millisecondes. */
export const MINUTE = 60_000;

/**
 * Limitation de débit (par adresse IP) :
 * - réglage général large : un poste de réception qui synchronise, rafraîchit et imprime ne s'en approche jamais ;
 * - réglages stricts posés route par route (`@Throttle`) sur ce qu'un inconnu peut appeler : connexion, inscription, commande, demande
 *   de réservation, mot de passe oublié.
 * Désactivée dans les tests (sinon des dizaines de requêtes depuis 127.0.0.1 se bloqueraient entre elles), sauf si `TEST_THROTTLE=1`.
 */
export const optionsThrottle: ThrottlerModuleOptions = {
  throttlers: [{ name: "default", ttl: MINUTE, limit: 600 }],
  skipIf: () => process.env.NODE_ENV === "test" && process.env.TEST_THROTTLE !== "1",
};

export const LIMITE_CONNEXION = { default: { limit: 20, ttl: MINUTE } };
export const LIMITE_RAFRAICHISSEMENT = { default: { limit: 60, ttl: MINUTE } };
export const LIMITE_ECRITURE_PUBLIQUE = { default: { limit: 10, ttl: MINUTE } };
export const LIMITE_INSCRIPTION = { default: { limit: 5, ttl: 10 * MINUTE } };
export const LIMITE_MOT_DE_PASSE_OUBLIE = { default: { limit: 5, ttl: 10 * MINUTE } };
