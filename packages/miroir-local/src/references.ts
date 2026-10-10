/** Champs qui désignent une autre ligne (clé étrangère) dans les documents et dans les payloads de la file. */
export const CLES_REFERENCE = [
  "chambreId",
  "clientId",
  "reservationId",
  "reservationLieeId",
  "compteId",
  "sousCompteId",
  "produitId",
  "ligneId",
  "venteId",
  "factureId",
] as const;

export function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Repli (très vieux moteurs) : RFC 4122 v4 à partir de Math.random.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Copie de `objet` où toute référence valant `ancien` vaut `nouveau` ; `null` si rien à changer. */
export function reecrireReferences<T extends Record<string, any>>(objet: T, ancien: string, nouveau: string): T | null {
  let copie: Record<string, any> | null = null;
  for (const cle of CLES_REFERENCE) {
    if (objet[cle] === ancien) {
      copie ??= { ...objet };
      copie[cle] = nouveau;
    }
  }
  return copie as T | null;
}
