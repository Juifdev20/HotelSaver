import { createHash } from "crypto";
import { HttpException, HttpStatus } from "@nestjs/common";
import type { PrismaClient } from "@hotel-chicago/database";

/**
 * Protection contre les essais abusifs à l'inscription (18/10/2026, voir DECISIONS.md) :
 * - un essai gratuit par numéro, À VIE (table EssaiUtilise, jamais vidée — même quand l'hôtel est supprimé) ;
 * - au plus `maxInscriptionsParJour` hôtels créés en 24 h depuis une même adresse internet ou un même appareil.
 *
 * Seules des EMPREINTES sont gardées (SHA-256 salé) : aucun numéro ni adresse en clair. Le sel est `EMPREINTE_SEL` s'il est défini,
 * sinon la clé service Supabase (secrète et stable par projet) — aucune variable de plus à configurer.
 */
export const MESSAGE_TROP_D_INSCRIPTIONS =
  "Trop d'hôtels créés depuis cet appareil aujourd'hui. Réessayez demain ou contactez le support HotelSaver.";

const JOUR_MS = 86_400_000;

export function empreinte(valeur: string): string {
  const sel = process.env.EMPREINTE_SEL || process.env.SUPABASE_SERVICE_ROLE_KEY || "hotelsaver";
  return createHash("sha256").update(`${sel}:${valeur.trim().toLowerCase()}`).digest("hex");
}

/** Identifiant d'appareil envoyé par le bureau et le mobile (en-tête X-Appareil) : ignoré s'il est absent ou fantaisiste. */
export function appareilValide(brut: unknown): string | null {
  const valeur = Array.isArray(brut) ? brut[0] : brut;
  return typeof valeur === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(valeur) ? valeur : null;
}

/** Refuse (429) au-delà de `max` inscriptions sur 24 h pour la même adresse OU le même appareil. */
export async function verifierLimiteInscriptions(prisma: PrismaClient, ip: string, appareil: string | null, max: number, maintenant = new Date()): Promise<void> {
  if (max <= 0) return;
  const depuis = new Date(maintenant.getTime() - JOUR_MS);
  const memeOrigine = [{ ipEmpreinte: empreinte(ip) }, ...(appareil ? [{ appareilEmpreinte: empreinte(appareil) }] : [])];
  const nombre = await prisma.inscriptionRecente.count({ where: { createdAt: { gt: depuis }, OR: memeOrigine } });
  if (nombre >= max) throw new HttpException(MESSAGE_TROP_D_INSCRIPTIONS, HttpStatus.TOO_MANY_REQUESTS);
}

/** Ce numéro (normalisé +243…) a-t-il déjà eu un essai gratuit ? */
export async function essaiDejaUtilise(prisma: PrismaClient, telephone: string): Promise<boolean> {
  return (await prisma.essaiUtilise.count({ where: { telephoneEmpreinte: empreinte(telephone) } })) > 0;
}

/** Après une inscription réussie : le numéro a eu son essai, et l'origine compte pour la limite du jour. */
export async function noterInscription(prisma: PrismaClient, telephone: string, ip: string, appareil: string | null): Promise<void> {
  await prisma.$transaction([
    prisma.essaiUtilise.upsert({ where: { telephoneEmpreinte: empreinte(telephone) }, create: { telephoneEmpreinte: empreinte(telephone) }, update: {} }),
    prisma.inscriptionRecente.create({ data: { ipEmpreinte: empreinte(ip), appareilEmpreinte: appareil ? empreinte(appareil) : null } }),
  ]);
}
