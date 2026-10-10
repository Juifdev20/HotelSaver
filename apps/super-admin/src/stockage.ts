/** Le jeton de renouvellement du super-admin (qui contrôle tous les hôtels) ne survit PAS à la fermeture de l'onglet : `sessionStorage`, pas
 * `localStorage` — sur un ordinateur partagé, fermer le navigateur suffit à se déconnecter.
 *
 * Équivalent web d'AsyncStorage (apps/mobile/src/stockage/profils.ts) : un
 * seul compte Super-Admin par session navigateur, pas de notion de
 * "profils" multiples ici — juste le jeton de rafraîchissement Supabase. */
const CLE = "hotelsaver-super-admin:refresh-token";

export function lireJetonRafraichissement(): string | null {
  try {
    return sessionStorage.getItem(CLE);
  } catch {
    return null;
  }
}

export function ecrireJetonRafraichissement(jeton: string): void {
  try {
    sessionStorage.setItem(CLE, jeton);
  } catch {
    // sessionStorage indisponible (navigation privée stricte, etc.) — la session
    // ne survivra pas à un rechargement, mais l'app reste utilisable.
  }
}

export function oublierJetonRafraichissement(): void {
  try {
    sessionStorage.removeItem(CLE);
  } catch {
    // rien à faire
  }
}
