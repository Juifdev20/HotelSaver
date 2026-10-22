import { estRecuProvisoire } from "@hotel-chicago/regles";

export interface OptionsNumeroDefinitif {
  /** Le réseau est-il là ? Sans lui, inutile d'attendre : le reçu part provisoire (et le dit). */
  enLigne: boolean;
  /** Attente maximale avant d'imprimer quand même le reçu provisoire (serveur lent). */
  delaiMs?: number;
  pauseMs?: number;
  maintenant?: () => number;
  attendre?: (ms: number) => Promise<void>;
}

/**
 * Un encaissement (facture d'un séjour, vente de la cafétéria) s'écrit d'abord sur l'appareil avec un numéro provisoire TEMP-…,
 * MÊME EN LIGNE : c'est ce qui permet de travailler sans réseau. Le numéro définitif arrive avec la synchronisation. Avant, le reçu
 * était imprimé tout de suite, donc toujours « établi hors connexion » alors que la connexion était là (constaté le 22/10/2026).
 *
 * En ligne, on lance la synchronisation et on relit le reçu jusqu'à ce qu'il ait son vrai numéro, `delaiMs` au plus. Sans réseau, ou si
 * le serveur ne répond pas à temps, on rend le reçu tel quel : provisoire, et il le dit. `relire` doit retrouver le reçu par son numéro
 * provisoire (l'identifiant local change à la synchronisation, `numeroProvisoire` reste).
 */
/** Parmi des reçus relus, celui qui correspond à `recu` (même identifiant, ou même numéro provisoire après la synchronisation) —
 * le définitif s'il y en a un. */
export function retrouverRecu<T extends { id: string; numeroRecu: string; numeroProvisoire?: string | null }>(recu: T, candidats: T[]): T | undefined {
  const memes = candidats.filter((c) => c.id === recu.id || (c.numeroProvisoire ?? null) === recu.numeroRecu);
  return memes.find((c) => !estRecuProvisoire(c.numeroRecu)) ?? memes[0];
}

export async function attendreNumeroDefinitif<T extends { numeroRecu: string }>(
  recu: T,
  relire: () => Promise<T | null | undefined>,
  synchroniser: () => Promise<void>,
  options: OptionsNumeroDefinitif
): Promise<T> {
  if (!estRecuProvisoire(recu.numeroRecu) || !options.enLigne) return recu;
  const maintenant = options.maintenant ?? Date.now;
  const attendre = options.attendre ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const limite = maintenant() + (options.delaiMs ?? 8000);
  let dernier = recu;
  while (maintenant() < limite) {
    const reste = Math.max(0, limite - maintenant());
    // Une synchronisation qui ne rend pas la main (réseau qui tombe en route) ne bloque pas l'impression au-delà du délai.
    await Promise.race([synchroniser().catch(() => undefined), attendre(reste)]);
    const relu = await relire().catch(() => null);
    if (relu) dernier = relu;
    if (!estRecuProvisoire(dernier.numeroRecu)) return dernier;
    await attendre(options.pauseMs ?? 700);
  }
  return dernier;
}
