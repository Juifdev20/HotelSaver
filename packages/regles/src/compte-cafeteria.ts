/**
 * Annulation d'un compte cafétaria créé par erreur (19/10/2026) : règles et messages PARTAGÉS entre le serveur
 * (apps/api/src/cafeteria/cafeteria.service.ts) et le hors ligne (packages/miroir-local, Ecritures) — voir AGENTS.md.
 */

export const MESSAGE_COMPTE_ANNULE = "Ce compte cafétaria a été annulé.";
export const MESSAGE_COMPTE_DEJA_ENCAISSE = "Une partie de ce compte est déjà encaissée : annulez d'abord le reçu (Ventes).";
export const MESSAGE_COMPTE_DEJA_FERME = "Ce compte cafétaria est déjà fermé (encaissé).";

/** Un compte se laisse annuler s'il est encore ouvert et que RIEN n'y a été encaissé (aucune part payée, aucun reçu valide). */
export function raisonRefusAnnulationCompte(compte: {
  statut: string;
  sousComptes?: { payeLe?: string | Date | null }[];
  ventes?: { annuleLe?: string | Date | null }[];
}): string | null {
  if (compte.statut === "ANNULE") return MESSAGE_COMPTE_ANNULE;
  if (compte.statut !== "OUVERT") return MESSAGE_COMPTE_DEJA_FERME;
  if ((compte.sousComptes ?? []).some((sc) => sc.payeLe)) return MESSAGE_COMPTE_DEJA_ENCAISSE;
  if ((compte.ventes ?? []).some((v) => !v.annuleLe)) return MESSAGE_COMPTE_DEJA_ENCAISSE;
  return null;
}
