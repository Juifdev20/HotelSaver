/**
 * Reçu provisoire, remis au client quand l'encaissement se fait SANS connexion : le vrai numéro (REC-/CAF-AAAAMMJJ-####) n'existe
 * qu'une fois la vente enregistrée par le serveur, qui est seul à numéroter sans trou ni doublon.
 *
 * TEMP-<poste>-<AAAAMMJJ>-<nnn> : `poste` = 4 caractères propres à CET appareil (deux postes hors ligne ne produisent jamais le
 * même numéro), `nnn` = compteur du jour sur cet appareil. Le serveur garde ce numéro à côté du vrai pour retrouver le reçu.
 */
export const PREFIXE_RECU_PROVISOIRE = "TEMP-";

export function estRecuProvisoire(numeroRecu: string | null | undefined): boolean {
  return typeof numeroRecu === "string" && numeroRecu.startsWith(PREFIXE_RECU_PROVISOIRE);
}

/** Identifiant court de l'appareil : 4 caractères A-Z/0-9, tirés au hasard une fois à l'installation. */
export function genererCodePoste(aleatoire: () => number = Math.random): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O/1/I : lisible sur un ticket
  return Array.from({ length: 4 }, () => alphabet[Math.floor(aleatoire() * alphabet.length)]).join("");
}

/** Jour en cours à Lubumbashi (UTC+2, sans heure d'été), « AAAAMMJJ ». */
export function jourCompact(maintenant: Date = new Date(), decalageHeures = 2): string {
  return new Date(maintenant.getTime() + decalageHeures * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
}

export function numeroRecuProvisoire(codePoste: string, jour: string, compteur: number): string {
  return `${PREFIXE_RECU_PROVISOIRE}${codePoste}-${jour}-${String(compteur).padStart(3, "0")}`;
}
