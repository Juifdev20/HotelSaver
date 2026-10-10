import type { PrismaClient } from "@hotel-chicago/database";

/**
 * Suivi des sessions Supabase (identifiant `session_id` du jeton) — voir le modèle SessionUtilisateur.
 * Un résultat « session valide » est gardé 30 s en mémoire pour ne pas ajouter une requête à chaque appel ; une révocation est donc
 * effective immédiatement sur l'instance qui l'a faite et au plus 30 s plus tard sur les autres.
 */
const DUREE_CACHE_MS = 30_000;
const TAILLE_MAX_CACHE = 5000;
const valides = new Map<string, number>();

export class SessionRevoqueeError extends Error {}

/** Vérifie (et enregistre au premier passage) la session d'un jeton. Lève SessionRevoqueeError si elle a été révoquée. */
export async function verifierSession(prisma: PrismaClient, sessionId: string, utilisateurId: string, maintenant = Date.now()): Promise<void> {
  const cle = `${sessionId}:${utilisateurId}`; // la session est valable pour CET utilisateur seulement
  const expire = valides.get(cle);
  if (expire !== undefined && expire > maintenant) return;

  const existante = await prisma.sessionUtilisateur.findUnique({ where: { sessionId }, select: { revoqueLe: true, utilisateurId: true } });
  if (existante) {
    if (existante.revoqueLe || existante.utilisateurId !== utilisateurId) throw new SessionRevoqueeError();
  } else {
    // Première fois que l'API voit cette session. Deux requêtes simultanées : la seconde échoue sur la clé primaire, sans importance.
    await prisma.sessionUtilisateur.create({ data: { sessionId, utilisateurId } }).catch(() => undefined);
  }
  if (valides.size >= TAILLE_MAX_CACHE) valides.clear();
  valides.set(cle, maintenant + DUREE_CACHE_MS);
}

/** Révoque TOUTES les sessions connues d'un utilisateur (mot de passe changé, compte désactivé, départ d'un employé). */
export async function revoquerSessions(prisma: PrismaClient, utilisateurId: string, sauf?: string): Promise<number> {
  const filtre = { utilisateurId, revoqueLe: null, ...(sauf ? { sessionId: { not: sauf } } : {}) };
  const sessions = await prisma.sessionUtilisateur.findMany({ where: filtre, select: { sessionId: true } });
  if (sessions.length === 0) return 0;
  await prisma.sessionUtilisateur.updateMany({ where: filtre, data: { revoqueLe: new Date() } });
  for (const s of sessions) valides.delete(`${s.sessionId}:${utilisateurId}`);
  return sessions.length;
}

/** Tests : oublie le cache. */
export function viderCacheSessions(): void {
  valides.clear();
}
