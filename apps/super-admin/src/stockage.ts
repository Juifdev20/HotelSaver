/** Équivalent web d'AsyncStorage (apps/mobile/src/stockage/profils.ts) : un
 * seul compte Super-Admin par session navigateur, pas de notion de
 * "profils" multiples ici — juste le jeton de rafraîchissement Supabase. */
const CLE = "hotelsaver-super-admin:refresh-token";

export function lireJetonRafraichissement(): string | null {
  try {
    return localStorage.getItem(CLE);
  } catch {
    return null;
  }
}

export function ecrireJetonRafraichissement(jeton: string): void {
  try {
    localStorage.setItem(CLE, jeton);
  } catch {
    // localStorage indisponible (navigation privée stricte, etc.) — la session
    // ne survivra pas à un rechargement, mais l'app reste utilisable.
  }
}

export function oublierJetonRafraichissement(): void {
  try {
    localStorage.removeItem(CLE);
  } catch {
    // rien à faire
  }
}
