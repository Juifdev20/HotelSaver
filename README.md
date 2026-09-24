# Hôtel Chicago — Application de gestion

Monorepo pnpm/Turborepo pour l'application de gestion de l'Hôtel Chicago
(Kasindi, Nord-Kivu, RDC). Voir `hotel-chicago-prompt-claude-code.md` à la
racine pour la spécification complète du produit, et `DECISIONS.md` pour les
hypothèses prises pendant la réalisation.

**État actuel : le backend est fonctionnellement complet (toute la section 8)
et vérifié en conditions réelles** (monorepo, schéma de base de données
appliqué à Supabase de production, policies RLS appliquées, authentification,
matrice de permissions testée de bout en bout, modules Chambres/Réservations/
Factures/Produits/Stock/Cafétaria avec logique métier réelle — disponibilité,
check-in/out, gestion de stock, comptes ouverts et sous-comptes, calcul
multi-devises et paiement croisé, intégration ventes cafétaria → facture de
chambre —, Dashboard patron scopé par rôle, endpoints publics du site
vitrine, et synchronisation hors ligne avec détection de conflit).

**L'app Electron a commencé** : connexion Supabase réelle + écran Chambres,
testés de bout en bout avec Playwright sur la vraie app. Ce qui reste : les
autres écrans Electron (réservations, facturation, cafétaria) et
l'impression thermique, les bases SQLite locales qui consommeraient le
module de sync, le mobile, et le site public lui-même (Next.js) — voir le
README de chaque paquet dans `apps/` et `DECISIONS.md`.

## Structure

```
apps/
  api/       Backend NestJS — construit (Phase 1 : Auth/RBAC ; Phases 2-3 : Réception + Cafétaria)
  web/       Site public Next.js — pas encore construit (Phase 7)
  mobile/    App React Native — pas encore construite (Phase 5)
  desktop/   App Electron — connexion + écran Chambres (reste à venir : autres écrans, impression)
packages/
  database/      Schéma Prisma + client, connecté à Supabase Postgres
  types/         Types partagés (double build CJS pour l'API / ESM pour le renderer)
  ui/            Design system (section 12) : jetons, Button, StatusBadge, RoomCard, formatMontant
  api-client/    Client HTTP typé + connexion Supabase Auth
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

## Créer un compte du personnel (dont le premier compte patron)

Se connecter demande **deux** choses : un compte Supabase Auth (email + mot
de passe) et une ligne `Utilisateur` liée qui porte le rôle métier. Aucun
écran de gestion des comptes n'existe encore ; ce script crée les deux d'un
coup (et supprime le compte Supabase si l'écriture en base échoue, pour ne
jamais laisser de compte sans rôle) :

```bash
pnpm --filter database build
MOT_DE_PASSE='...' pnpm --filter database creer-utilisateur patron@exemple.com "Nom du patron" PATRON
```

Rôles : `PATRON`, `RECEPTIONNISTE`, `CAFETARIA`. Le mot de passe passe par
une variable d'environnement pour ne pas rester dans l'historique des
arguments. Nécessite `DATABASE_URL` (`packages/database/.env`) et
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (`apps/api/.env`).

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
- `/produits`, `/stock`, `/cafeteria` (Phase 3) : logique métier réelle —
  menu (PATRON gère, CAFETARIA lit), mouvements de stock avec entrée/sortie/
  perte/ajustement et refus si stock insuffisant, comptes ouverts avec
  sous-comptes, lignes de commande (décrémente le stock automatiquement),
  encaissement en 3 modes (GROUPE / PAR_SOUS_COMPTE / PARTAGE_EGAL avec
  répartition exacte sans perte d'arrondi). Un règlement `FACTURE_CHAMBRE`
  remonte automatiquement dans le total de la `Facture` de la chambre liée
  à la création de celle-ci. RECEPTIONNISTE n'a aucun accès à ce module.
- `/dashboard/*` : recette du jour, occupation, ventes récentes, stock bas.
  RECEPTIONNISTE et CAFETARIA ne voient que leurs propres opérations ; PATRON
  voit tout, jamais fusionné entre USD/CDF ni entre chambres/cafétaria.
- `/public/*` : **aucune authentification** — chambres disponibles (avec
  vérification réelle de chevauchement si `dateArrivee`/`dateDepart` sont
  fournis), menu actif, création d'une demande de réservation `EN_ATTENTE`
  (jamais confirmée automatiquement). Ne jamais ajouter de guard global qui
  s'appliquerait à ce contrôleur — le site public n'a pas de compte
  (section 9.1).
- `/sync/push`, `/sync/pull` (section 10.3) : synchronisation hors ligne.
  Chaque opération de `push` délègue au service métier existant de son type
  d'entité (Chambre, Réservation, Produit, MouvementStock, CompteCafeteria,
  SousCompte, LigneCommande — Facture/VenteCafeteria exclues, voir
  `DECISIONS.md`), avec détection de conflit par `syncVersion` : si la
  version serveur a changé depuis la dernière lecture de l'appareil, le
  serveur gagne et renvoie l'état actuel (statut `CONFLICT`), rien n'est
  écrasé silencieusement (section 10.4). Une opération invalide renvoie un
  statut `ERROR` pour elle seule, sans faire échouer tout le lot.

## Tests

```bash
pnpm test                    # tous les tests unitaires (api, ui, api-client)
pnpm --filter api test       # API seule
```

Tests E2E de l'app Electron (vraie app, vraie API, vrai compte Supabase) :
voir `apps/desktop/README.md` — ignorés tant que les variables `E2E_*` ne
sont pas définies.

Côté API, les tests vérifient notamment la matrice de permissions complète
(`apps/api/test/roles.e2e-spec.ts`, requis section 14) : un rôle
`CAFETARIA` reçoit bien 403 sur les routes Chambres/Réservations, un rôle
`RECEPTIONNISTE` reçoit bien 403 sur les routes Produits/Stock/Cafétaria, et
`PATRON` accède à tout. Ces tests utilisent un `PrismaClient` mocké — aucune
connexion réseau à Supabase n'est nécessaire pour les faire passer.

## Déploiement

Non couvert par cette phase — voir `DECISIONS.md`. Sera traité en Phase 8
(section 15 du prompt d'origine), une fois les modules métier réels
construits.
