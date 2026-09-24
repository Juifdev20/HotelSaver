# Hôtel Chicago — Application de gestion

Monorepo pnpm/Turborepo pour l'application de gestion de l'Hôtel Chicago
(Kasindi, Nord-Kivu, RDC). Voir `hotel-chicago-prompt-claude-code.md` à la
racine pour la spécification complète du produit, et `DECISIONS.md` pour les
hypothèses prises pendant la réalisation.

**État actuel : Phase 1 et le backend de la Phase 2 terminés et vérifiés en
conditions réelles** (monorepo, schéma de base de données appliqué à
Supabase de production, policies RLS appliquées, authentification, matrice
de permissions testée de bout en bout, modules Chambres/Réservations/
Factures avec logique métier réelle — disponibilité, check-in/out, calcul
multi-devises et paiement croisé). L'application Electron (UI + impression
thermique), le module Cafétaria, le mode hors ligne, le mobile, le tableau
de bord patron et le site public ne sont pas encore construits — voir le
README de chaque paquet dans `apps/` pour le détail, et `DECISIONS.md` pour
le découpage en phases.

## Structure

```
apps/
  api/       Backend NestJS — construit (Phase 1 : Auth/RBAC ; Phase 2 : Chambres/Réservations/Factures)
  web/       Site public Next.js — pas encore construit (Phase 7)
  mobile/    App React Native — pas encore construite (Phase 5)
  desktop/   App Electron — pas encore construite (Phase 2b : UI + impression)
packages/
  database/      Schéma Prisma + client, connecté à Supabase Postgres
  types/         Types partagés (minimal pour l'instant : Auth/RBAC)
  ui/            Design system partagé — pas encore construit
  api-client/    Client HTTP typé partagé — pas encore construit
  sync-engine/   Moteur de synchronisation hors ligne — pas encore construit
assets/      Ressources graphiques statiques (logo, icônes...) — voir section 5.1 du prompt
```

**Où trouver une image donnée** (section 5.1 du prompt) :
- Logo, icônes d'application, photos du carrousel du site : fichiers statiques
  dans `assets/` à la racine, fournis une fois par le patron — jamais
  uploadés depuis un écran de l'application.
- Photos de chambres et photos du menu cafétaria : contenu dynamique ajouté
  depuis l'application, stocké dans **Supabase Storage** (buckets
  `chambres-photos` et `menu-photos`), jamais dans ce repo.

## Prérequis

- Node.js ≥ 20 (testé avec v24.19.0)
- pnpm (`npm install -g pnpm` si `corepack enable` échoue avec une erreur de
  permission sur Windows)
- Un projet Supabase (Postgres + Auth) — les vraies informations
  d'identification de production sont fournies par le patron, jamais
  inventées ni commitées.

## Installation

```bash
pnpm install
```

## Configuration des variables d'environnement

Deux fichiers `.env` à créer à partir de leurs `.env.example` (jamais
commités) :

1. `apps/api/.env` — informations Supabase + secret JWT. Voir
   `apps/api/.env.example` pour la liste complète des variables et
   `DECISIONS.md` pour le détail de la vérification du jeton Supabase Auth
   **et pour `DATABASE_URL` : utiliser le pooler Supabase en mode session
   (port 5432), pas la connexion directe** (`db.<ref>.supabase.co` est
   IPv6-only sur les projets récents et souvent injoignable).
2. `packages/database/.env` — doit contenir la **même** `DATABASE_URL` que
   `apps/api/.env` (la CLI Prisma cherche son `.env` dans le répertoire du
   paquet `database`, pas dans `apps/api`). Voir
   `packages/database/.env.example`.

## Base de données

```bash
# Génère le client Prisma
pnpm --filter database generate

# Applique le schéma à l'instance Supabase de production réelle
# (jamais de Postgres local — voir la contrainte non négociable section 2)
pnpm --filter database migrate:dev

# Applique ensuite les policies RLS (pas gérées par Prisma) :
pnpm --filter database apply-rls
```

## Compiler les paquets partagés

`packages/types` et `packages/database` doivent être compilés (`tsc`) avant
de lancer ou builder l'API — voir `DECISIONS.md` pour l'explication complète
(Node exécute du JS compilé, pas les `.ts` sources de ces paquets) :

```bash
pnpm --filter types build
pnpm --filter database build
```

Ou simplement `pnpm build` à la racine (Turborepo respecte l'ordre de
dépendance des paquets automatiquement).

## Lancer l'API en développement

```bash
pnpm --filter api start:dev
```

- `GET /health` → vérifie que l'API répond (pas d'authentification requise).
- `/chambres`, `/reservations`, `/factures` (Phase 2) : logique métier réelle
  — CRUD, disponibilité (pas de double réservation sur une même période),
  check-in/check-out, facturation multi-devises avec paiement croisé
  (section 9.4). Accès RECEPTIONNISTE + PATRON, sauf création/modification
  du prix ou du type d'une chambre et suppression d'une chambre (PATRON
  seul). Voir `DECISIONS.md` pour les hypothèses de calcul (montant dû,
  paiement croisé, formule du prix de séjour).
- `/produits`, `/stock`, `/cafeteria/comptes` restent des **stubs de
  Phase 1** : ils ne font que prouver le contrôle d'accès par rôle et
  renvoient un message indiquant la phase (3) où la logique métier réelle
  sera implémentée.

## Tests

```bash
pnpm --filter api test
```

Vérifie notamment la matrice de permissions complète
(`apps/api/test/roles.e2e-spec.ts`, requis section 14) : un rôle
`CAFETARIA` reçoit bien 403 sur les routes Chambres/Réservations, un rôle
`RECEPTIONNISTE` reçoit bien 403 sur les routes Produits/Stock/Cafétaria, et
`PATRON` accède à tout. Ces tests utilisent un `PrismaClient` mocké — aucune
connexion réseau à Supabase n'est nécessaire pour les faire passer.

## Déploiement

Non couvert par cette phase — voir `DECISIONS.md`. Sera traité en Phase 8
(section 15 du prompt d'origine), une fois les modules métier réels
construits.
