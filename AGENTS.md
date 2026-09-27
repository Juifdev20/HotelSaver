# Hôtel Chicago — repères pour agents

Monorepo pnpm + Turborepo. Les décisions et leur historique sont dans
`DECISIONS.md` (à lire avant de toucher à l'architecture ; y ajouter une
section pour toute décision non triviale).

## Commandes

- Installer : `pnpm install` (node-linker hoisted, voir `.npmrc`).
- Build complet : `pnpm build` (Turborepo). `packages/database` régénère le
  client Prisma avant `tsc` (`src/generated/` est gitignoré).
- API : `pnpm --filter api start:dev` (port **3001** — le 3000 est pris par un
  autre projet), `pnpm --filter api test` (Jest, ~80 s, 127 tests),
  `pnpm --filter api build`.
- Tests paquets : `pnpm --filter @hotel-chicago/sync-engine test`,
  `pnpm --filter @hotel-chicago/api-client test`,
  `pnpm --filter @hotel-chicago/receipts test`.
- Mobile (Expo bare, appareil USB) : `adb reverse tcp:3001 tcp:3001 && adb
  reverse tcp:8081 tcp:8081`, puis `pnpm --filter mobile android` et
  `pnpm --filter mobile dev --port 8081`. Typecheck : `npx tsc --noEmit` dans
  `apps/mobile`. Si le port 8081 est occupé : `netstat -ano | findstr :8081`
  puis `taskkill //PID <pid> //F`.
- Desktop : `pnpm --filter desktop build` (electron-vite).

## Base de données (Prisma 7 + `pg`)

- Connexion via le pooler Supabase en **mode transaction** (port 6543), sans
  `pgbouncer=true`. Ne pas remettre ce paramètre : il n'a plus d'effet avec
  l'adaptateur `pg`, et avec l'ancien moteur il multipliait par 6 le coût de
  chaque requête (voir DECISIONS.md, 27/09/2026).
- `DATABASE_URL` doit être présent dans `process.env` AVANT l'import de
  `@hotel-chicago/database` (Prisma 7 ne lit plus les `.env`) : dans l'API
  c'est `apps/api/src/charger-env.ts`, premier import de `main.ts`.
- Migrations : `prisma migrate deploy/status` échouent via ce pooler. Utiliser
  `pnpm --filter @hotel-chicago/database migrate:verifier` puis
  `migrate:appliquer` (script `pg` brut compatible `_prisma_migrations`).
  Créer une migration reste `prisma migrate dev` contre une base directe.
- Mesure de latence rapide (dans `packages/database`, après build) :
  `new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }] })` et
  `prisma.$on("query", …)` — une lecture simple doit produire **une seule**
  ligne SQL (~250–300 ms depuis Kasindi).

## Secrets

`.env` présents localement dans `apps/api` et `packages/database`, jamais
commités (`.gitignore`). Ne jamais les afficher en clair ; la clé Supabase
**anon** est publique par conception et embarquée côté client.
