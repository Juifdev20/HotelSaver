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
- Tests d'intégration (vraie base **locale jetable**, jamais Supabase) : `TEST_INTEGRATION=1 DATABASE_URL=postgresql://…@localhost:…/hotel_t pnpm --filter @hotel-chicago/api test:integration`.
  Ils vident la base : une garde refuse toute base distante ou dont le nom n'est pas en `_t`/`test`. Schéma : `createdb hotel_t` puis
  `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script | psql hotel_t`. Sans `TEST_INTEGRATION=1` ils sont ignorés.
  `isolation.e2e-spec.ts` vérifie, avec DEUX hôtels, qu'aucune route ne lit ni ne modifie les données de l'autre — à relancer après tout changement de service/DTO.
  `sync.e2e-spec.ts` / `hors-ligne.e2e-spec.ts` / `appareil.e2e-spec.ts` couvrent la synchronisation (doublons, ordres, reçus provisoires, vrais appareils) ;
  `navigateur.e2e-spec.ts` pilote le bureau dans Chromium (`TEST_NAVIGATEUR=1`, après `pnpm --filter desktop build`, Chromium dans `/opt/pw-browsers/chromium` ou `CHROMIUM_PATH`).
  Les suites partagent la même base : elles tournent en série (`--runInBand`, déjà dans le script).
- **Hors ligne (bureau)** : toute écriture passe par `packages/miroir-local` (`Ecritures`) — miroir local + file d'envoi en UNE transaction ; toute lecture par `ClientHorsLigne`.
  Une nouvelle action métier hors ligne = (1) un type d'opération côté serveur (`sync.service.ts`, `entites-synchronisables.ts`, miroir dans `packages/api-client`), (2) la règle dans `Ecritures`
  avec les MÊMES messages d'erreur que le serveur, (3) un scénario dans `appareil.e2e-spec.ts`. Les calculs d'argent vivent UNIQUEMENT dans `packages/regles`.
- Après un changement de `packages/sync-engine`, `packages/miroir-local` ou `packages/api-client` : `pnpm --filter <paquet> build` (le bureau et le mobile lisent `dist/`) ; les tests d'intégration, eux, lisent les sources.
- Tests paquets : `pnpm --filter @hotel-chicago/miroir-local test`, `pnpm --filter @hotel-chicago/regles test`, `pnpm --filter @hotel-chicago/sync-engine test`,
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
- **Installateur Windows (Prod)** : `pnpm --filter @hotel-chicago/desktop empaqueter` → `apps/desktop/release/HotelSaver-Setup-<version>.exe`
  (API en ligne + Supabase Prod par défaut, surchargeables par `MAIN_VITE_*`). Tester l'exe depuis le terminal VS Code :
  retirer `ELECTRON_RUN_AS_NODE` (`env -u ELECTRON_RUN_AS_NODE …`), sinon Electron démarre comme Node et quitte aussitôt.
- **APK Android publiée (Prod)** : dans `apps/mobile/android`, `EXPO_PUBLIC_API_URL=https://hotelsaver-api.onrender.com`,
  `EXPO_PUBLIC_SITE_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (projet Prod) puis
  `gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a` (téléphones ARM seulement : sans x86 d'émulateur,
  build bien plus court et APK presque deux fois plus léger) → `app/build/outputs/apk/release/app-release.apk`. Signée avec la clé de `apps/mobile/signature/` (ignorée par Git,
  **à sauvegarder** — voir `plugins/withSignatureRelease.js`) ; sans elle, la release retombe sur la clé de debug.

Sous Windows : `adb.exe` est dans
`%LOCALAPPDATA%\Android\Sdk\platform-tools` (pas dans le PATH global) ; le
build Android exige `JAVA_HOME=C:\Program Files\Java\jdk-21.0.12` et
`ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`. La politique d'exécution bloque
`pnpm.ps1` : utiliser `pnpm.cmd`.

## Base de données (Prisma 7 + `pg`)

- **Deux projets Supabase** (17/10/2026) : « Hotelsaver Test » (développement : API locale, bureau, mobile,
  super-admin) et « Hotelsaver Prod » (version publiée, variables Render). Les scripts de `packages/database`
  lisent `.env.test` par défaut, `.env.prod` avec `--prod` (+ `--oui-prod` pour écrire) — voir `scripts/cible.js`.
  **Toute nouvelle migration passe d'abord sur Test** (`migrate:appliquer`), puis sur Prod à la mise en production
  (`migrate:verifier:prod`, `migrate:appliquer:prod -- --oui-prod`). Une migration qui crée une table rejoue le bloc
  RLS final de `20261017120000_base_initiale` (RLS sur toutes les tables). Les 34 migrations d'avant la base
  unique sont dans `prisma/migrations-archive/` (historique seulement, jamais rejouées).

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
  l'API (nodemon ne surveille que `apps/api/src`). Si le modèle est
  synchronisé, penser aussi à `entites-synchronisables.ts` (serveur) et à
  `packages/miroir-local` (bureau ET mobile partagent cette base locale).
- Migrations : `prisma migrate deploy/status` échouent via ce pooler. Utiliser
  `pnpm --filter @hotel-chicago/database migrate:verifier` puis
  `migrate:appliquer` (script `pg` brut compatible `_prisma_migrations`).
  Chaque migration part en UN seul message (objets + trace ensemble ou rien, même si le réseau coupe) ; après une coupure, le
  script relit l'état. Objets présents mais migration non enregistrée (vérifiés identiques à Test) : `--marquer <nom>`.
  Créer une migration : SQL écrit à la main (ou `prisma migrate diff`), contrôlé
  sur une base locale jetable puis sur Test. Super-admin d'un projet :
  `MOT_DE_PASSE='…' pnpm --filter @hotel-chicago/database creer-super-admin <tél> "<nom>"` (`-- --prod --oui-prod` pour Prod).
- Mesure de latence rapide (dans `packages/database`, après build) :
  `new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }] })` et
  `prisma.$on("query", …)` — une lecture simple doit produire **une seule**
  ligne SQL (~250–300 ms depuis Kasindi).

## Essai gratuit et protection contre les abus (18/10/2026)

- Les plafonds de l'essai (chambres, produits, galerie), le délai avant suppression et la limite d'inscriptions par jour vivent dans
  `ParametresPlateforme` (réglables dans le super-admin). Une nouvelle création soumise à plafond = le contrôle dans le service
  serveur (via `plafondsEssaiDe`) ET dans `Ecritures` (hors ligne), avec `messagePlafondEssai` de `packages/regles`.
- Les essais abandonnés sont supprimés par `NettoyageEssaisService` (03:30) ; à la main : dans `apps/api`,
  `node --require @swc-node/register scripts/nettoyer-essais.ts` (vise la base de `apps/api/.env`). Toute nouvelle table liée à
  `Hotel` en `Restrict` doit être ajoutée à `supprimerHotel` (enfants d'abord).

## Secrets

`.env` présents localement dans `apps/api` et `packages/database`, jamais
commités (`.gitignore`). Ne jamais les afficher en clair ; la clé Supabase
**anon** est publique par conception et embarquée côté client.
