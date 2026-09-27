import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

/**
 * Prisma 7 + driver adapter `pg` (migration du 27/09/2026, voir DECISIONS.md).
 *
 * Pourquoi : avec Prisma 5 et `?pgbouncer=true` (obligatoire derrière le pooler
 * Supabase en mode transaction), le moteur Rust enveloppait CHAQUE requête
 * dans BEGIN / DEALLOCATE ALL / prepare / execute / COMMIT — ~6 allers-retours
 * × 250 ms depuis Kasindi = 1,2 à 4 s pour un simple findFirst. Ici une lecture
 * simple = un seul `pool.query()` avec instruction non nommée, compatible avec
 * le pooler en mode transaction sans `pgbouncer=true` ; les vraies
 * transactions (`$transaction`) prennent un client dédié BEGIN…COMMIT.
 *
 * Réglages du pool `pg` (Prisma 7 ne fixe plus ses propres valeurs) :
 * - connectionTimeoutMillis : `pg` n'a pas de délai par défaut (0) ; l'ouverture
 *   TCP+TLS+auth vers Supabase prend ~2–2,5 s depuis ici.
 * - idleTimeoutMillis : `pg` ferme une connexion inactive après 10 s par défaut,
 *   ce qui ferait repayer ces 2,5 s à chaque creux d'activité de la réception.
 * - max : le pooler partagé Supabase a peu de connexions serveur ; l'API n'a
 *   besoin que de quelques clients.
 */
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 10 * 60_000,
  keepAlive: true,
});

export const prisma = globalThis.__prisma__ ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma__ = prisma;
}

export * from "./generated/prisma/client";
