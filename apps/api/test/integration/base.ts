/**
 * Tests d'intégration contre une VRAIE base Postgres (jamais celle de production).
 *
 * Désactivés par défaut : ils ne tournent que si TEST_INTEGRATION=1 ET si DATABASE_URL vise une base locale dont le
 * nom se termine par « _t » ou contient « test ». Ils VIDENT toutes les tables au démarrage : la garde ci-dessous
 * refuse tout ce qui ressemble à Supabase ou à une base distante.
 *
 *   createdb hotel_t && prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script | psql hotel_t
 *   TEST_INTEGRATION=1 DATABASE_URL=postgresql://postgres@localhost:54330/hotel_t?host=/tmp pnpm --filter @hotel-chicago/api test integration
 */
export const INTEGRATION = process.env.TEST_INTEGRATION === "1";

export function verifierBaseJetable(): void {
  const url = process.env.DATABASE_URL ?? "";
  const local = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url) || /[?&]host=\//.test(url);
  const nom = /\/([A-Za-z0-9_]+)(\?|$)/.exec(url)?.[1] ?? "";
  if (!local || !(/_t$/.test(nom) || /test/i.test(nom)) || /supabase|pooler/i.test(url)) {
    throw new Error(
      `Refus : ces tests vident la base. DATABASE_URL doit viser une base LOCALE jetable (nom en « _t » ou « test »), pas « ${url.replace(/:\/\/.*@/, "://***@")} ».`,
    );
  }
}

/** `describe` qui ne s'exécute que si les tests d'intégration sont demandés. */
export const decrire: jest.Describe = INTEGRATION ? describe : describe.skip;
