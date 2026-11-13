/**
 * Anti-double-scan (13/11/2026). Une douchette ou la caméra en mode continu relit très vite le MÊME code-barres tant que l'article reste devant elle :
 * un seul article se retrouvait ajouté plusieurs fois. Le même code n'est donc accepté qu'une fois par fenêtre de quelques secondes ; un AUTRE code passe
 * toujours tout de suite. Tant que le code reste devant le lecteur (relu avant la fin de la fenêtre), la fenêtre se prolonge : il faut l'écarter un
 * instant pour pouvoir le scanner de nouveau. Pour ajouter volontairement plusieurs exemplaires d'un coup : le bouton « + » du produit.
 */
export const DELAI_MEME_CODE_MS = 2500;

export interface DernierScan {
  code: string;
  /** Dernière fois que ce code a été VU (accepté ou ignoré), en millisecondes. */
  le: number;
  /** Le doublon en cours a déjà été signalé à l'utilisateur (un seul message par série). */
  signale: boolean;
}

export interface VerdictScan {
  accepte: boolean;
  /** Doublon ignoré qui n'a pas encore été signalé : le moment d'afficher « déjà scanné ». */
  aSignaler: boolean;
  suivant: DernierScan;
}

export function evaluerScan(dernier: DernierScan | null, code: string, maintenant: number, delai = DELAI_MEME_CODE_MS): VerdictScan {
  if (dernier && dernier.code === code && maintenant - dernier.le < delai) {
    return { accepte: false, aSignaler: !dernier.signale, suivant: { code, le: maintenant, signale: true } };
  }
  return { accepte: true, aSignaler: false, suivant: { code, le: maintenant, signale: false } };
}
