/**
 * Mouvements de stock saisis à la main (18/10/2026) : la caisse (CAFETARIA) n'enregistre que des ENTRÉES (réception de
 * marchandise). PERTE et AJUSTEMENT font baisser ou corriger le stock sans vente : réservés au patron. Règle et message
 * PARTAGÉS entre le serveur (apps/api/src/stock/stock.service.ts) et le hors ligne (packages/miroir-local, Ecritures).
 */

export const MESSAGE_MOUVEMENT_RESERVE_PATRON = "Seul le patron peut enregistrer une perte ou un ajustement de stock.";

/** Types de mouvement manuel que ce rôle peut saisir. */
export function typesMouvementAutorises(role: string): ("ENTREE" | "PERTE" | "AJUSTEMENT")[] {
  return role === "PATRON" ? ["ENTREE", "PERTE", "AJUSTEMENT"] : ["ENTREE"];
}

/** null si le mouvement est permis, sinon le message de refus (403). */
export function raisonRefusMouvementStock(role: string, type: string): string | null {
  return (typesMouvementAutorises(role) as string[]).includes(type) ? null : MESSAGE_MOUVEMENT_RESERVE_PATRON;
}
