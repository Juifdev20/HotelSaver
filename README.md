# Hôtel Chicago — Application de gestion

Monorepo pnpm/Turborepo pour l'application de gestion de l'Hôtel Chicago
(Kasindi, Nord-Kivu, RDC). Voir `hotel-chicago-prompt-claude-code.md` à la
racine pour la spécification complète du produit, et `DECISIONS.md` pour les
hypothèses prises pendant la réalisation.

**HotelSaver est une plateforme multi-hôtels qui fonctionne SANS connexion Internet** (bureau Windows et mobile Android),
puis se synchronise avec le serveur dès que le réseau revient. Chaque hôtel ne voit que ses propres données (testé sur une vraie
base à deux hôtels), et le travail de la journée — réserver, installer, facturer, servir, encaisser — continue pendant une coupure.

| Application | Sans connexion |
|---|---|
| **Bureau (Electron)** | **Complet** : réception (réservations, arrivées/départs, check-in/out, clients, facturation avec reçu provisoire), cafétaria (comptes, lignes, encaissement, cuisine), stock, dépenses, tableau de bord. Ouverture de l'application sans Internet (durée de grâce de 14 jours). |
| **Mobile (Android)** | Réservations, chambres, clients, comptes et lignes de cafétaria, dépenses. **Pas encore** : check-in/out, facturation et encaissement sans connexion (voir `BACKLOG.md`). |
| **API (NestJS)** | Prête pour les deux : envois rejouables sans doublon, ordres (check-in, annulation, facture, encaissement), reçus provisoires, suppressions, pagination, horloges. |
| **Site public (Next.js)** | Pas encore construit. |

**Comment ça marche, en bref**

- Le bureau garde une copie des données de l'hôtel dans une **base locale par hôtel** (IndexedDB). Les écrans lisent cette copie
  (instantané, identique avec ou sans réseau) ; chaque action est enregistrée dans la copie **et** dans une file d'envoi, dans la
  même transaction.
- Un **moteur de synchronisation** (`packages/sync-engine`) envoie la file dans l'ordre, reçoit les changements du serveur page par
  page, détecte les conflits (le serveur gagne, la personne tranche) et dit la vérité dans un **indicateur** : « À jour » seulement
  quand tout est vraiment envoyé.
- Un encaissement fait hors ligne reçoit un **reçu provisoire `TEMP-<poste>-<jour>-<n>`**, imprimé avec la mention « REÇU
  PROVISOIRE ». Au retour du réseau, le serveur attribue le vrai numéro (`REC-…` / `CAF-…`) et garde le numéro provisoire pour le
  retrouver.
- On peut **rouvrir l'application sans Internet** : le mot de passe est vérifié sur l'appareil (empreinte salée, jamais le mot de
  passe), tant que l'appareil a parlé au serveur depuis moins de 14 jours (licence suspendue ou compte désactivé entre-temps ⇒
  refus à la reconnexion). L'horloge de l'appareil ne peut pas servir à gagner du temps.
- « Effacer les données de cet appareil » (écran Synchronisation) retire la copie locale ; refusé tant que des actions n'ont pas été
  envoyées.

Détail des décisions : `DECISIONS.md` (entrées du 10/10/2026). Reste à faire : `BACKLOG.md`.

## Structure

```
apps/
  api/       Backend NestJS (multi-hôtels, synchronisation, Prisma 7 + Postgres)
  desktop/   Application Windows (Electron + React) — hors ligne complet
  mobile/    Application Android (React Native / Expo)
  web/       Site public Next.js — pas encore construit
packages/
  database/      Schéma Prisma + client
  types/         Types partagés
  regles/        Règles métier pures (encaissement, partage, nuitées, reçus provisoires) : UNE version, API et appareils
  api-client/    Client HTTP typé + connexion Supabase Auth
  sync-engine/   Moteur de synchronisation (file d'envoi, réception paginée, conflits, indicateur d'état)
  miroir-local/  Base locale hors ligne : documents persistants, client « d'abord sur l'appareil », session hors ligne
  receipts/      Construction des reçus (chambre, cafétaria, provisoires) et ESC/POS
  ui/            Design system
assets/      Ressources graphiques statiques
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
  `push` accepte des créations (réservation, chambre, produit, mouvement de stock, compte/personne/ligne de cafétaria, dépense,
  **facture de séjour**, **encaissement cafétaria**), des modifications (avec `syncVersion` : le serveur gagne en cas de conflit, rien
  n'est écrasé en silence) et des **ordres** (check-in/out, annulation, confirmation, avancement en cuisine). Chaque opération
  délègue au service métier existant ; une opération invalide renvoie `ERROR` pour elle seule. Une création rejouée ou envoyée en
  double ne crée qu'une ligne (table `SyncCorrespondance`) ; une action qui cite l'identifiant local d'une ligne créée plus tôt dans
  la même file est résolue côté serveur (par hôtel). `pull` est paginé (`limite`, `_meta.tronque`), renvoie l'heure du serveur
  (`_meta.curseur`) et les suppressions (`_meta.suppressions`).

## Tests

```bash
pnpm test                    # tests unitaires de tous les paquets
pnpm --filter api test       # API seule
```

**Tests d'intégration sur une vraie base Postgres locale** (jamais Supabase — une garde refuse toute autre base) :

```bash
createdb hotel_t
prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script | psql hotel_t     # dans packages/database
TEST_INTEGRATION=1 DATABASE_URL=postgresql://…@localhost:…/hotel_t pnpm --filter @hotel-chicago/api test:integration
```

| Fichier (`apps/api/test/integration/`) | Ce qu'il prouve |
|---|---|
| `isolation.e2e-spec.ts` | Avec DEUX hôtels, aucune route ne lit ni ne modifie les données de l'autre (82 vérifications) |
| `sync.e2e-spec.ts` | Doublons, reprises, pagination, suppressions, horodatage borné, charges forgées |
| `hors-ligne.e2e-spec.ts` | Une journée entière rejouée d'un coup : réservation → check-in → facture, cafétaria → encaissement, reçus provisoires |
| `appareil.e2e-spec.ts` | De VRAIS appareils (base locale + client + moteur) face au vrai serveur, réseau coupé/rétabli, conflits, réponses perdues |
| `navigateur.e2e-spec.ts` | L'application bureau dans un VRAI navigateur (Chromium) : connexion, coupure, redémarrage sans Internet, retour du réseau, facture TEMP→REC. Demande `TEST_NAVIGATEUR=1` et `pnpm --filter desktop build` |

Tests E2E de l'app Electron packagée (vraie app, vraie API, vrai compte Supabase) : voir `apps/desktop/README.md`.

La matrice de permissions (`apps/api/test/roles.e2e-spec.ts`, requis section 14) utilise un `PrismaClient` mocké : aucun accès réseau.

## Déploiement

Non couvert par cette phase — voir `DECISIONS.md`. Sera traité en Phase 8
(section 15 du prompt d'origine), une fois les modules métier réels
construits.
