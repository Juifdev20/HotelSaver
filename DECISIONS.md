# DECISIONS.md — Hypothèses et décisions prises sans confirmation explicite

Ce fichier documente, comme demandé section 0 et section 17 du prompt
d'origine (`hotel-chicago-prompt-claude-code.md`), toute hypothèse prise en
l'absence d'information explicite. Il sera complété au fil des phases
suivantes — ne pas le considérer comme figé après la Phase 1.

## Découpage en phases (décision validée avec l'utilisateur)

Le prompt d'origine demande de construire l'intégralité du produit (4
surfaces applicatives, mode hors ligne, impression thermique, déploiement)
« sans s'arrêter pour demander confirmation ». Étant donné l'ampleur réelle
du travail (voir section 16, ~8 phases distinctes touchant 4 stacks
différentes), l'utilisateur a choisi explicitly de scoper cette première
passe à la **Phase 1 du plan de réalisation (section 16, étape 1)
uniquement** : monorepo, schéma Prisma multi-devises, connexion Supabase de
production, module Auth, matrice de permissions et tests associés.

Les phases suivantes (2 à 8 : modules métier Réception/Cafétaria, mode hors
ligne, portage mobile, tableau de bord patron, site public, déploiement
Render) sont **volontairement non traitées** dans cette passe et feront
l'objet de plans de travail séparés. Les paquets `apps/web`, `apps/mobile`,
`apps/desktop`, `packages/ui`, `packages/api-client`, `packages/sync-engine`
existent dans le workspace (structure correcte dès le départ, section 5) mais
ne contiennent qu'un `package.json` + `README.md` d'espace réservé — ce ne
sont pas des applications fonctionnelles pour l'instant, et leurs README le
disent explicitement pour éviter toute confusion dans une session future.

## Ressources graphiques (section 5.1, section 12.6)

Le patron a fourni `assets/logo/logo-couleur.png` (monogramme doré-roux sur
fond blanc plein). C'est exactement le cas anticipé section 12.6 (« le logo
a un fond blanc intégré au fichier fourni ») : il ne doit être posé que sur
un fond clair, jamais retravaillé ou redessiné en version transparente par
approximation. Les autres fichiers listés section 5.1 (versions SVG,
monochromes, favicon, icônes desktop/mobile, photos du hero du site public)
restent manquants — voir `assets/README.md` pour le détail exact de ce qui
est fourni vs manquant. À redemander au patron le moment venu (Phase 2 pour
l'écran de connexion, Phase 7 pour le site public), pas fabriqués par
approximation.

Un lien d'artefact claude.ai partagé par le patron
(`https://claude.ai/artifact/SG8P9xkiixTuVB5rRVsFbw`) a été consulté : il ne
contient qu'un titre « Design System » sans contenu exploitable (aucun asset
téléchargeable, aucun jeton de couleur). À reconfirmer avec le patron si ce
lien devait pointer vers autre chose.

## Outillage (section 4)

- **pnpm** n'était pas installé sur la machine et `corepack enable` a échoué
  (`EPERM` sur `C:\Program Files\nodejs`, droits administrateur requis sur ce
  poste Windows). Installé à la place via `npm install -g pnpm` (pnpm
  12.6.0). Le champ `packageManager` du `package.json` racine reflète cette
  version réellement installée plutôt que la version par défaut de corepack.
- Git n'était pas initialisé dans le dossier — `git init` exécuté en tout
  début de Phase 1.
- Turborepo choisi conformément à la section 4 (pas Nx).

## Schéma Prisma (section 7)

Le schéma du prompt d'origine a été transcrit à l'identique (mêmes entités,
mêmes relations, mêmes noms de champs), avec deux ajustements strictement
mécaniques nécessaires à la compilation Prisma (un schéma Prisma exige les
deux côtés d'une relation) :

- `Produit` gagne `mouvementsStock MouvementStock[]` et
  `lignesCommande LigneCommande[]` (relations inverses de `MouvementStock.produit`
  et `LigneCommande.produit`, absentes du prompt d'origine).
- `CompteCafeteria` gagne `ventes VenteCafeteria[]` (relation inverse de
  `VenteCafeteria.compte`).

Aucune entité, aucun champ métier n'a été ajouté ou retiré par rapport à la
section 7.

**Schéma Postgres** : les tables sont créées directement dans le schéma
`public` de l'instance Supabase de production (pas de schéma `dev` séparé).
Le prompt autorise explicitement cette option (« reste sur l'instance
Supabase unique ») et comme il s'agit du tout premier déploiement du projet
(base vide), l'isolation par schéma n'apporte rien de plus qu'un schéma
`public` propre.

**Connexion Postgres : pooler (session mode), pas connexion directe.** Le
projet Supabase du patron a été créé récemment et son hôte de connexion
directe (`db.krvhnsyvlkgvcxncvwkx.supabase.co`) ne résout qu'en IPv6 — sans
route IPv6 utilisable sur ce réseau de développement (confirmé avec
`nslookup`/`Test-NetConnection`, échec `P1001` de Prisma). `DATABASE_URL`
utilise donc le pooler Supavisor fourni par le patron, en **mode session**
(port `5432`, pas `6543`) :

```
postgresql://postgres.krvhnsyvlkgvcxncvwkx:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
```

Le mode session a été choisi plutôt que le mode transaction (port `6543`)
parce que `prisma migrate` a besoin de verrous consultatifs (`advisory
locks`) et de requêtes préparées que le pooler en mode transaction ne
supporte pas de façon fiable. Comme le backend est un unique processus
Node long-lived (pas de fonctions serverless/edge à forte concurrence), le
mode session convient aussi très bien pour le trafic applicatif normal — pas
besoin de deux `DATABASE_URL` différentes pour l'instant. À reconsidérer si
Render se révèle avoir un accès IPv6 fonctionnel vers Supabase (auquel cas la
connexion directe redeviendrait possible et légèrement plus simple).

**`packages/database/.env`** : en plus de `apps/api/.env` (section 6), un
second `.env` (même valeur `DATABASE_URL`) est nécessaire dans
`packages/database/`, car la CLI Prisma est invoquée avec
`pnpm --filter database ...` et cherche un `.env` dans le répertoire courant
du paquet, pas dans `apps/api`. Documenté dans `packages/database/.env.example`
et dans le README racine.

## Authentification Supabase (section 14)

Le prompt liste une variable générique `JWT_SECRET` dans `apps/api/.env.example`
(section 6) sans préciser explicitement le mécanisme de vérification. Décision
prise : `JWT_SECRET` = le *JWT Secret* (legacy, HS256) du projet Supabase,
disponible dans Dashboard → Project Settings → API. `SupabaseAuthGuard`
(`apps/api/src/common/guards/supabase-auth.guard.ts`) vérifie la signature du
jeton avec ce secret, extrait le `sub` (id Supabase Auth de l'utilisateur),
puis va chercher le rôle réel dans la table `Utilisateur` (jamais dans le
jeton lui-même — le rôle métier vit dans notre base, pas dans Supabase Auth).

**Point d'attention explicite** : si le projet Supabase du patron utilise les
nouvelles clés de signature asymétriques (JWKS, RS256/ES256) plutôt que le
secret JWT partagé legacy, `SupabaseAuthGuard` devra être adapté pour
vérifier via le point de terminaison JWKS de Supabase au lieu d'un secret
partagé. À vérifier dès que les vraies informations d'identification
Supabase seront fournies, avant le premier déploiement réel.

## RLS Supabase vs Guards NestJS (section 7, section 9.3)

Le backend NestJS se connecte à Supabase Postgres via Prisma avec la
`DATABASE_URL` (généralement associée à un rôle Postgres qui contourne la
RLS, comme c'est le cas avec la clé `service_role`). **L'enforcement réel des
permissions pour tout ce qui passe par l'API se fait donc par
`SupabaseAuthGuard` + `RolesGuard` côté NestJS**, testés explicitement
(`apps/api/test/roles.e2e-spec.ts`, requis section 14).

Les policies RLS écrites dans `packages/database/prisma/rls-policies.sql`
reproduisent quand même fidèlement la matrice de la section 9.3 : elles
servent de seconde ligne de défense pour tout accès direct futur à Supabase
qui contournerait l'API (par exemple si `packages/sync-engine`, en Phase 4,
en venait à interroger PostgREST directement avec le jeton de l'utilisateur
plutôt que de passer par `/sync/push` et `/sync/pull`). Ce fichier SQL n'est
pas géré par une migration Prisma (Prisma ne gère pas nativement la RLS) : il
doit être appliqué manuellement une fois la première migration Prisma
passée, via le SQL Editor de Supabase ou `psql`.

## Paquets partagés compilés en JS, pas exécutés depuis leur source TS (section 4)

`packages/types` et `packages/database` pointent leur `main`/`types` vers
`dist/index.js`/`dist/index.d.ts` (compilés via `tsc`), pas directement vers
`src/index.ts`. Constaté en testant le démarrage réel de l'API : Node.js 24
sait exécuter certains fichiers `.ts` nativement (« type stripping »), mais
seulement une syntaxe strictement effaçable — un `enum` TypeScript (utilisé
dans `packages/types` pour `Role`/`Devise`) génère du code à l'exécution et
fait échouer `node dist/main.js` avec `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Il
faut donc `pnpm --filter types build` et `pnpm --filter database build`
avant `pnpm --filter api build`/`start`. `turbo.json` gère déjà cet ordre via
`dependsOn: ["^build"]` pour la cible `build` ; à la main, respecter cet
ordre (types → database → api).

## render.yaml (section 15)

Non créé dans cette passe : le déploiement Render est une étape de la Phase
8 du plan de réalisation, après que les modules métier réels existent.
Créer un `render.yaml` maintenant, pointant vers une API qui n'expose que des
routes stub, n'aurait pas de valeur et créerait un faux sentiment
d'achèvement.
