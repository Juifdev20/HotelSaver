import { ErreurApi } from "@hotel-chicago/api-client";
import type { ClientApi } from "@hotel-chicago/api-client";

/**
 * Enveloppe le client de l'application pour repérer UNE chose : une réponse 403 `FONCTION_NON_INCLUSE` (le serveur refuse une route dont la
 * fonction n'est pas incluse dans la formule de l'hôtel). L'application peut alors afficher le panneau « Cette fonction n'est pas incluse »
 * à la place de l'écran, sans que chaque écran ait à le gérer. L'erreur reste transmise telle quelle à celui qui a fait l'appel.
 *
 * `quand()` donne le contexte au moment de l'APPEL (ex. la page affichée) : une réponse tardive d'une page quittée n'est pas attribuée à la
 * page suivante.
 */
export function surveillerFonctionsRefusees<T extends ClientApi, C>(client: T, quand: () => C, surRefus: (contexte: C) => void): T {
  return new Proxy(client, {
    get(cible, propriete) {
      // `cible` sert de receveur : les champs privés et le `this` interne du client restent intacts.
      const valeur = Reflect.get(cible, propriete, cible) as unknown;
      if (typeof valeur !== "function") return valeur;
      return (...args: unknown[]) => {
        const contexte = quand();
        const resultat = (valeur as (...a: unknown[]) => unknown).apply(cible, args);
        if (resultat && typeof (resultat as PromiseLike<unknown>).then === "function") {
          (resultat as PromiseLike<unknown>).then(undefined, (e: unknown) => {
            if (e instanceof ErreurApi && e.code === "FONCTION_NON_INCLUSE") surRefus(contexte);
          });
        }
        return resultat;
      };
    },
  });
}
