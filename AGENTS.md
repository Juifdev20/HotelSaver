# Hôtel Chicago — repères pour agents

Monorepo pnpm + Turborepo. Les décisions et leur historique sont dans
`DECISIONS.md` (à lire avant de toucher à l'architecture ; y ajouter une
section pour toute décision non triviale).

## Commandes

- Installer : `pnpm install` (node-linker hoisted, voir `.npmrc`).
- Build complet : `pnpm build` (Turborepo). `packages/database` régénère le
  client Prisma avant `tsc` (`src/generated/` est gitignoré).
- API : `pnpm --filter api start:dev` (port **3000**, cf. `main.ts` ;
  `EXPO_PUBLIC_API_URL` côté mobile pointe sur `localhost:3000`),
  `pnpm --filter api test` (Jest, ~80 s, 127 tests),
  `pnpm --filter api build`.
- Tests paquets : `pnpm --filter @hotel-chicago/sync-engine test`,
  `pnpm --filter @hotel-chicago/api-client test`,
  `pnpm --filter @hotel-chicago/receipts test`.
- Mobile (Expo bare, appareil USB) : `adb reverse tcp:3000 tcp:3000 && adb
  reverse tcp:8081 tcp:8081`, puis `pnpm --filter mobile dev --port 8081`
  (Metro) et `pnpm --filter mobile android --no-bundler` (build + install +
  lancement ; `--port` et `--no-bundler` sont mutuellement exclusifs).
  Typecheck : `npx tsc --noEmit` dans `apps/mobile`. Si le port 8081 est
  occupé : `netstat -ano | findstr :8081` puis `taskkill //PID <pid> //F`.
  ⚠️ `android/app/build.gradle` a `debuggableVariants = []` : l'APK debug
  **embarque** le JS au moment du build et le téléphone ne lit pas Metro.
  Toute modification JS demande de reconstruire et réinstaller l'APK
  (`gradlew assembleDebug` puis `adb install -r …/app-debug.apk`, ~6 min) ;
  un simple redémarrage de l'app ne montre rien de neuf. Vérifier un
  changement : chercher un texte du nouveau code dans
  `android/app/build/generated/assets/react/debug/index.android.bundle`.
  Après l'ajout d'un fichier dans un paquet, Metro peut aussi garder une
  carte périmée : le relancer avec `--reset-cache`.
- Tout-en-un : `.\demarrer.ps1` (tunnel USB + API + Metro + Desktop ;
  `-Reset` pour vider le cache Metro).
- Desktop : `pnpm --filter desktop build` (electron-vite).

Sous Windows : `adb.exe` est dans
`%LOCALAPPDATA%\Android\Sdk\platform-tools` (pas dans le PATH global) ; le
build Android exige `JAVA_HOME=C:\Program Files\Java\jdk-21.0.12` et
`ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`. La politique d'exécution bloque
`pnpm.ps1` : utiliser `pnpm.cmd`.

## Base de données (Prisma 7 + `pg`)

- Connexion via le pooler Supabase en **mode transaction** (port 6543), sans
  `pgbouncer=true`. Ne pas remettre ce paramètre : il n'a plus d'effet avec
  l'adaptateur `pg`, et avec l'ancien moteur il multipliait par 6 le coût de
  chaque requête (voir DECISIONS.md, 27/09/2026).
- `DATABASE_URL` doit être présent dans `process.env` AVANT l'import de
  `@hotel-chicago/database` (Prisma 7 ne lit plus les `.env`) : dans l'API
  c'est `apps/api/src/charger-env.ts`, premier import de `main.ts`.
- Après TOUTE modification de `schema.prisma` : `pnpm --filter
  @hotel-chicago/database build` (`prisma generate` seul régénère
  `src/generated/` mais ne compile pas `dist/` — l'API lit `dist/` et
  planterait avec `Unknown field` / `undefined.findMany`), puis redémarrer
  l'API (nodemon ne surveille que `apps/api/src`). Côté mobile, penser aussi
  au miroir SQLite (`apps/mobile/src/stockage/sqlite.ts` + upserts dans
  `stockageLocalMobile.ts` / `cafeteriaMirroir.ts`) si le modèle y est
  synchronisé.
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
