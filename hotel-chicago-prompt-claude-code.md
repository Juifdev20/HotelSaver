# PROMPT DE RÉALISATION — Application de gestion Hôtel Chicago (Kasindi)

> Ce document est un prompt d'ingénierie complet à coller directement dans Claude Code (ou tout autre agent de développement IA) pour qu'il réalise l'application de bout en bout : backend, base de données, application desktop, application mobile, et site web public. Il contient toutes les décisions déjà prises : architecture, stack technique, modules, permissions, mode hors ligne, impression thermique, charte graphique et hébergement. Ne rien improviser en dehors de ce qui est décrit ici sans le signaler explicitement.

---

## 0. Contexte et rôle

Tu es un ingénieur logiciel senior chargé de construire, de façon autonome et production-ready, l'application complète de gestion de l'**Hôtel Chicago**, un hôtel avec restaurant/cafétaria situé à l'adresse suivante :

```
Hôtel Chicago
Quartier Congo ya Sika
Kasindi, Province du Nord-Kivu
République Démocratique du Congo (RDC)
```

Utilise cette adresse exacte partout où l'identité de l'hôtel doit apparaître : reçus imprimés (section 11), écran de connexion, pied de page et section contact du site web public (section 13).

L'hôtel n'a pas d'internet fiable en permanence : la connexion coupe régulièrement. Le personnel (réceptionnistes, serveurs de cafétaria) n'est pas à l'aise avec l'informatique : l'interface doit être simple, visuelle, et tolérante aux erreurs. Autre particularité locale importante : **l'hôtel travaille avec deux devises en parallèle**, le dollar américain (USD) et le franc congolais (CDF) — certaines chambres sont tarifées en dollars, d'autres en francs, et il en va de même pour les produits de la cafétaria (certaines boissons en francs, d'autres en dollars). Le système doit gérer cette double devise nativement, jamais en supposant une devise unique (détails complets section 9.4).

Le patron de l'hôtel est le seul administrateur du système et doit pouvoir tout superviser, y compris à distance depuis son téléphone.

Construis un **monorepo complet**, avec du code réel, fonctionnel et testable — jamais du code de démonstration, jamais de `TODO` laissés en suspens sans que ce soit explicitement signalé. Si une information manque, fais l'hypothèse la plus raisonnable, applique-la, et note-la clairement dans un fichier `DECISIONS.md` à la racine du projet plutôt que de t'arrêter pour demander.

---

## 1. Vue d'ensemble du produit

Quatre surfaces applicatives, un seul backend, une seule base de données :

1. **Application Réception** (desktop + mobile/tablette) — gestion des chambres, réservations, arrivées/départs, facturation, impression de reçus.
2. **Application Cafétaria** (desktop + mobile/tablette) — vente au comptoir, gestion des comptes ouverts par table/client, gestion du stock, impression de reçus.
3. **Tableau de bord Patron** (desktop + mobile, lecture principalement) — supervision globale : recette du jour, taux d'occupation, ventes, stock, gestion des employés et des prix, accessible à distance.
4. **Site web public** — vitrine de l'hôtel, consultation des chambres disponibles et du menu de la cafétaria, formulaire de pré-réservation.

Les trois premières surfaces doivent fonctionner **sans connexion internet continue** (voir section 10, mode hors ligne — c'est le point fort non négociable du produit). Le site web public, lui, nécessite une connexion (c'est un site public consulté par des clients externes).

---

## 2. Contraintes non négociables

Respecte strictement ces contraintes, elles ont été validées avec le client et ne sont pas ouvertes à interprétation :

- **La base de données de production Supabase Postgres est utilisée directement dès le développement.** Ne mets jamais en place une base Postgres locale avec pgAdmin « pour tester ». Toutes les migrations, tout le développement, tous les tests d'intégration se font contre le projet Supabase réel, dont les identifiants sont fournis via un fichier `.env` (voir section 6). Utilise un schéma `dev` séparé ou des préfixes de table si tu as besoin d'isoler des données de test, mais reste sur l'instance Supabase unique.
- **Hébergement sur Render** pour le backend (API NestJS) ET pour le frontend du site web public. Pas d'autre hébergeur. Configure les fichiers `render.yaml` nécessaires pour un déploiement automatique depuis GitHub.
- **Mode hors ligne = Option 1 (cache local par appareil + synchronisation), pas PowerSync.** Le budget ne permet pas un service de synchronisation tiers payant. Implémente toi-même la synchronisation avec SQLite local + file d'attente de synchronisation (détails complets section 10).
- **Impression thermique obligatoire et personnalisée**, à la fois côté réception et côté cafétaria, connectée en Bluetooth ou USB depuis le téléphone ou le PC (détails section 11).
- **Interface utilisateur simple**, pensée pour des utilisateurs peu à l'aise avec la technologie : gros boutons, couleurs et mots pour chaque statut, confirmation avant toute action irréversible.
- **Mode sombre disponible partout**, pas seulement sur le site public.
- Toujours écrire les textes d'interface en **français**.

---

## 3. Architecture technique globale

```
┌─────────────────────────┐     ┌──────────────────────────┐
│  App Réception            │     │  App Cafétaria            │
│  (Electron desktop +      │     │  (Electron desktop +      │
│   React Native mobile)    │     │   React Native mobile)    │
│                            │     │                            │
│  SQLite local (cache +    │     │  SQLite local (cache +    │
│  file d'attente de sync)  │     │  file d'attente de sync)  │
└──────────────┬─────────────┘     └──────────────┬─────────────┘
               │  HTTPS (quand internet dispo)     │
               ▼                                    ▼
        ┌───────────────────────────────────────────────┐
        │   API Backend NestJS — hébergée sur Render      │
        │   (auth, règles métier, endpoints CRUD,         │
        │    endpoints de synchronisation)                │
        └───────────────────────┬─────────────────────────┘
                                  │
                                  ▼
                   ┌───────────────────────────┐
                   │  Supabase Postgres (prod)   │
                   │  + Supabase Auth             │
                   │  + Supabase Storage          │
                   │  (photos chambres, menu)     │
                   └───────────────────────────┘
                                  ▲
                                  │ HTTPS
        ┌─────────────────────────┴─────────────────────────┐
        │  Site web public — Next.js — hébergé sur Render     │
        │  (vitrine, chambres, menu, pré-réservation)          │
        └──────────────────────────────────────────────────┘

        ┌──────────────────────────────────────────────────┐
        │  Tableau de bord Patron — React Native + Electron   │
        │  (lecture temps réel via l'API, accès distant)       │
        └──────────────────────────────────────────────────┘
```

Principe : **le SQLite local est la source de vérité immédiate pour l'utilisateur** de la réception ou de la cafétaria — chaque action (vente, réservation, mouvement de stock) s'écrit d'abord en local et s'affiche instantanément, puis part dans une file d'attente qui se synchronise avec l'API dès qu'une connexion est détectée. L'API et Supabase restent la source de vérité globale pour le patron et le site public.

---

## 4. Stack technique exacte

Utilise exactement ces choix, ne les remplace pas par des équivalents sans le justifier dans `DECISIONS.md` :

| Couche | Technologie |
|---|---|
| Langage | TypeScript partout (backend, frontend web, mobile, desktop) |
| Backend API | NestJS (dernière version stable), architecture modulaire par domaine |
| Base de données | Supabase Postgres (production, connectée via `.env`) |
| ORM | Prisma (schéma unique partagé, migrations versionnées dans le repo) |
| Auth | Supabase Auth (JWT), rôles vérifiés côté NestJS avec des Guards personnalisés |
| Site web public | Next.js (App Router), déployé sur Render en Web Service |
| Application desktop (réception + cafétaria) | Electron, avec une interface React (partagée avec le mobile via composants communs autant que possible) |
| Application mobile (réception + cafétaria + patron) | React Native (Expo, workflow "bare"/prebuild pour accéder au Bluetooth des imprimantes) |
| Base locale hors ligne (mobile) | `expo-sqlite` ou `react-native-sqlite-storage` |
| Base locale hors ligne (desktop) | `better-sqlite3` (Electron, process principal) |
| Synchronisation | Module maison (voir section 10), pas de bibliothèque tierce payante |
| Impression thermique mobile | `react-native-esc-pos-printer` ou `react-native-thermal-receipt-printer-image-qr` (Bluetooth ESC/POS) |
| Impression thermique desktop | `node-thermal-printer` (USB/réseau/Bluetooth via Electron, process principal) |
| Monorepo | Turborepo (ou Nx si tu le préfères — reste cohérent tout le projet) avec `pnpm` comme gestionnaire de paquets |
| Hébergement backend + site public | Render (Web Services), `render.yaml` à la racine |
| Variables d'environnement | Fichier `.env` à la racine de chaque app, jamais commité (`.env.example` fourni) |
| Tests | Jest pour le backend, tests d'intégration a minima sur les endpoints critiques (réservation, vente, synchronisation) |

---

## 5. Structure du monorepo

```
hotel-chicago/
├── apps/
│   ├── api/                  # Backend NestJS
│   ├── web/                  # Site public Next.js
│   ├── mobile/                # App React Native (Réception + Cafétaria + Patron, avec sélection de profil au démarrage)
│   └── desktop/               # App Electron (Réception + Cafétaria, avec sélection de profil au démarrage)
├── packages/
│   ├── database/              # Schéma Prisma + migrations, partagé par api et par les modules de sync
│   ├── ui/                    # Composants partagés (Button, StatusBadge, RoomCard, OrderLine, DashboardStat...) — voir section 12
│   ├── types/                 # Types TypeScript partagés (DTO, entités, enums de statut)
│   ├── api-client/            # Client HTTP typé partagé entre web, mobile et desktop
│   └── sync-engine/           # Logique de synchronisation hors ligne partagée entre mobile et desktop
├── assets/                    # Ressources graphiques statiques du projet — voir section 5.1
├── render.yaml
├── DECISIONS.md
├── package.json
├── turbo.json
└── README.md
```

### 5.1 Dossier des ressources graphiques (`assets/`) — à bien distinguer des photos ajoutées depuis l'application

Il y a deux catégories d'images dans ce projet, et il ne faut jamais les confondre :

**A. Ressources statiques codées avec le projet** (le logo, les icônes, les photos du carrousel du site public) — fournies une fois pendant le développement, vivent dans le dossier `assets/` à la racine du repo, jamais uploadées depuis un écran de l'application :

```
assets/
├── logo/
│   ├── logo-couleur.svg              # logo principal, fond transparent si disponible
│   ├── logo-couleur.png              # export haute résolution (min. 2000 px de large)
│   ├── logo-monochrome-clair.svg     # version claire, à poser sur un fond sombre
│   ├── logo-monochrome-sombre.svg    # version sombre, à poser sur un fond clair
│   └── favicon.svg
├── icons/
│   ├── desktop/                      # icônes de l'app Electron (réception + cafétaria)
│   │   ├── icon.icns                 # macOS
│   │   ├── icon.ico                  # Windows
│   │   └── icon.png                  # Linux, 512x512
│   └── mobile/                       # icônes de l'app React Native
│       ├── icon.png                  # 1024x1024, sans coins arrondis déjà appliqués
│       ├── adaptive-icon-foreground.png  # icône adaptative Android
│       └── splash.png                # écran de démarrage (splash screen)
└── site-public/
    ├── hero/
    │   ├── hero-01.jpg … hero-06.jpg  # 6 photos minimum pour le carrousel animé du hero (section 13), format paysage, 1920x1080 minimum, poids optimisé (< 500 Ko chacune après compression)
    └── og-image.jpg                  # image de partage sur les réseaux sociaux, 1200x630
```

Si le logo fourni par le patron n'existe qu'en version « fond blanc plein » (c'est le cas actuellement, voir section 12.6), demande-lui explicitement les fichiers manquants (version fond transparent, icônes carrées pour les app stores) avant de les fabriquer toi-même par approximation — ne jamais improviser ou redessiner le logo.

**B. Contenu dynamique, ajouté depuis l'application** — jamais dans le repo, stocké dans **Supabase Storage** :

- Bucket `chambres-photos` : les photos de chaque chambre, ajoutées ou remplacées par le personnel directement depuis l'écran de création/modification d'une chambre (le champ `Chambre.photos` en base ne contient que les URLs Supabase Storage résultantes, jamais les fichiers eux-mêmes).
- Bucket `menu-photos` : la photo de chaque produit de la cafétaria, ajoutée depuis l'écran de gestion du menu (voir le champ `Produit.photo` ajouté section 7) — utile pour un rendu soigné du menu sur le site public (section 13).

Documente cette séparation dans le `README.md` racine : quiconque reprend le projet (toi-même dans une session future, ou un autre développeur) doit savoir en quelques secondes où chercher une image donnée, sans deviner.

---

## 6. Variables d'environnement (`.env`)

Crée un `.env.example` documenté à la racine de `apps/api` et un autre pour `apps/web`. Le patron te fournira les vraies valeurs de production Supabase et Render — ne les invente jamais, ne les commit jamais.

```
# apps/api/.env.example
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://hotelchicago.example.com
```

```
# apps/web/.env.example
NEXT_PUBLIC_API_URL=https://api-hotelchicago.onrender.com
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Les apps mobile et desktop stockent l'URL de l'API dans une configuration modifiable depuis un écran « Paramètres » (pas un `.env`, puisqu'elles tournent sur les postes de l'hôtel et doivent pouvoir être reconfigurées sans recompiler).

---

## 7. Schéma de base de données (Supabase Postgres, via Prisma)

Crée le schéma Prisma suivant comme point de départ (adapte les types si besoin, mais conserve exactement ces entités et ces relations — elles reflètent les règles métier validées avec le client) :

```prisma
enum Role {
  RECEPTIONNISTE
  CAFETARIA
  PATRON
}

enum StatutChambre {
  LIBRE
  OCCUPEE
  RESERVEE
  NETTOYAGE
}

enum StatutCompte {
  OUVERT
  FERME
}

enum ModePaiement {
  CASH
  MOBILE_MONEY
  FACTURE_CHAMBRE
}

enum Devise {
  USD
  CDF
}

model Utilisateur {
  id            String   @id @default(uuid())
  nom           String
  role          Role
  actif         Boolean  @default(true)
  supabaseAuthId String  @unique
  createdAt     DateTime @default(now())
}

model Chambre {
  id           String         @id @default(uuid())
  numero       String         @unique
  type         String
  prixParNuit  Decimal
  devise       Devise         // USD ou CDF, propre à chaque chambre
  statut       StatutChambre  @default(LIBRE)
  photos       String[]       // URLs Supabase Storage (bucket chambres-photos), ajoutées depuis l'app — voir section 5.1
  reservations Reservation[]
}

model Client {
  id        String   @id @default(uuid())
  nom       String
  telephone String?
  email     String?
  createdAt DateTime @default(now())
  reservations Reservation[]
}

model Reservation {
  id           String   @id @default(uuid())
  chambre      Chambre  @relation(fields: [chambreId], references: [id])
  chambreId    String
  client       Client   @relation(fields: [clientId], references: [id])
  clientId     String
  dateArrivee  DateTime
  dateDepart   DateTime
  acompte      Decimal  @default(0)
  statut       String   // EN_ATTENTE, CONFIRMEE, EN_COURS, TERMINEE, ANNULEE
  origine      String   // RECEPTION, SITE_PUBLIC
  createdBy    String   // Utilisateur.id
  facture      Facture?
}

model Facture {
  id              String      @id @default(uuid())
  reservation     Reservation @relation(fields: [reservationId], references: [id])
  reservationId   String      @unique
  // Montant du séjour lui-même, dans la devise propre à la chambre (Chambre.devise) :
  montantChambre  Decimal
  deviseChambre   Devise
  // Totaux incluant les ventes cafétaria liées à ce séjour (VenteCafeteria.reservationLieeId),
  // jamais convertis ni fusionnés entre devises (voir section 9.4) :
  montantTotalUSD Decimal     @default(0)
  montantTotalCDF Decimal     @default(0)
  modePaiement    ModePaiement
  // Ce que le client a réellement remis, si différent de la devise due (paiement croisé) :
  deviseRegleeParClient Devise?
  montantRegleParClient Decimal?
  tauxChangeApplique    Decimal? // copie du taux du jour utilisé pour le paiement croisé, jamais recalculé après coup
  numeroRecu    String      @unique
  imprimeLe     DateTime?
  annuleLe      DateTime?
  motifAnnulation String?
  createdAt     DateTime    @default(now())
}

model Produit {
  id          String  @id @default(uuid())
  nom         String
  categorie   String
  prix        Decimal
  devise      Devise  // USD ou CDF, propre à chaque produit
  photo       String? // URL Supabase Storage (bucket menu-photos), ajoutée depuis l'app — voir section 5.1
  stockActuel Decimal @default(0)
  seuilAlerte Decimal @default(5)
  actif       Boolean @default(true)
}

// Taux de change de référence, saisi manuellement par le PATRON, utilisé UNIQUEMENT
// à titre informatif (dashboard, paiement croisé) — jamais pour fusionner deux totaux
// légaux de devises différentes en un seul montant comptable.
model TauxChange {
  id           String   @id @default(uuid())
  cdfParUsd    Decimal  // ex: 2800 (1 USD = 2800 CDF)
  definiPar    String   // Utilisateur.id (PATRON)
  createdAt    DateTime @default(now())
}

model MouvementStock {
  id         String   @id @default(uuid())
  produit    Produit  @relation(fields: [produitId], references: [id])
  produitId  String
  quantite   Decimal
  type       String   // ENTREE, SORTIE_VENTE, PERTE, AJUSTEMENT
  motif      String?
  createdBy  String
  createdAt  DateTime @default(now())
}

model CompteCafeteria {
  id           String        @id @default(uuid())
  tableOuNom   String
  statut       StatutCompte  @default(OUVERT)
  ouvertPar    String        // Utilisateur.id
  ouvertLe     DateTime      @default(now())
  fermeLe      DateTime?
  sousComptes  SousCompte[]
}

model SousCompte {
  id        String  @id @default(uuid())
  compte    CompteCafeteria @relation(fields: [compteId], references: [id])
  compteId  String
  nom       String  // "Personne 1", ou un nom donné par le serveur
  lignes    LigneCommande[]
}

model LigneCommande {
  id           String     @id @default(uuid())
  sousCompte   SousCompte @relation(fields: [sousCompteId], references: [id])
  sousCompteId String
  produit      Produit    @relation(fields: [produitId], references: [id])
  produitId    String
  quantite     Decimal
  // Copie du prix ET de la devise du produit au moment de la commande (jamais recalculés
  // si le prix ou la devise du produit change ensuite) :
  prixUnitaire Decimal
  devise       Devise
  createdAt    DateTime   @default(now())
}

model VenteCafeteria {
  id              String       @id @default(uuid())
  compte          CompteCafeteria @relation(fields: [compteId], references: [id])
  compteId        String
  // Un même compte peut mélanger des articles en USD et en CDF : deux totaux séparés,
  // jamais additionnés entre eux (voir section 9.4) :
  montantTotalUSD Decimal      @default(0)
  montantTotalCDF Decimal      @default(0)
  modePaiement    ModePaiement
  deviseRegleeParClient Devise?
  montantRegleParClient Decimal?
  tauxChangeApplique    Decimal?
  reservationLieeId String?    // si facturé sur le séjour d'une chambre (Reservation.id)
  numeroRecu      String       @unique
  imprimeLe       DateTime?
  annuleLe        DateTime?
  motifAnnulation String?
  createdBy       String
  createdAt       DateTime     @default(now())
}
```

Ajoute les **index** sur `Chambre.statut`, `Reservation.dateArrivee/dateDepart`, `CompteCafeteria.statut`, et sur toutes les clés étrangères. Ajoute des **policies RLS Supabase** correspondant exactement à la matrice de permissions de la section 9 : un réceptionniste ne peut pas lire ou écrire les tables `Produit`, `MouvementStock`, ou modifier `Chambre.prixParNuit` ; un compte cafétaria ne peut pas toucher `Chambre` ni `Reservation` ; seul `PATRON` a un accès en écriture sur `Utilisateur`, `Produit.prix`, `Chambre.prixParNuit`.

Ajoute une colonne `updatedAt DateTime @updatedAt` et une colonne `syncVersion Int @default(1)` sur **toutes** les tables synchronisées (Chambre, Reservation, Facture, Produit, MouvementStock, CompteCafeteria, SousCompte, LigneCommande, VenteCafeteria) — elles sont indispensables au mécanisme de synchronisation décrit section 10.

Seul `PATRON` peut créer une ligne dans `TauxChange` (RLS en écriture réservée à ce rôle) ; toutes les autres surfaces le lisent uniquement (la dernière ligne créée est le taux du jour en vigueur).

---

## 8. Endpoints API (NestJS) — vue d'ensemble par module

Organise le backend en modules NestJS : `AuthModule`, `ChambresModule`, `ReservationsModule`, `FacturesModule`, `ProduitsModule`, `StockModule`, `CafeteriaModule`, `SyncModule`, `DashboardModule`, `PublicModule`.

Chaque module métier (Chambres, Réservations, Produits, Stock, Cafétaria) expose au minimum : `GET /` (liste, filtrable), `GET /:id`, `POST /`, `PATCH /:id`, et **jamais de `DELETE` physique** sur une donnée financière — remplace-le par un endpoint `POST /:id/annuler` qui exige un `motif` et conserve l'enregistrement (traçabilité comptable non négociable, voir section 9).

Ajoute spécifiquement :
- `POST /reservations/:id/check-in` et `POST /reservations/:id/check-out`
- `POST /cafeteria/comptes` (ouvrir un compte), `POST /cafeteria/comptes/:id/sous-comptes` (ajouter une personne), `POST /cafeteria/comptes/:id/lignes` (ajouter une commande), `POST /cafeteria/comptes/:id/encaisser` (fermer et facturer, avec un choix : total groupé / par sous-compte / partage égal — voir section 9.2)
- `GET /dashboard/recette-du-jour`, `GET /dashboard/occupation`, `GET /dashboard/ventes-recentes`, `GET /dashboard/stock-bas`
- `POST /public/reservations` (pré-réservation depuis le site public, statut `EN_ATTENTE`, à valider ensuite par la réception)
- `GET /public/chambres-disponibles`, `GET /public/menu`
- `POST /sync/push` et `GET /sync/pull` (voir section 10.3)

Protège chaque route avec un `RolesGuard` lisant le rôle du token Supabase Auth, en appliquant strictement la matrice de la section 9.

---

## 9. Modules fonctionnels et permissions

### 9.1 Récapitulatif des rôles

- **RECEPTIONNISTE** : chambres, réservations, check-in/check-out, factures de séjour, impression.
- **CAFETARIA** : menu (lecture), ventes, comptes ouverts, stock (mouvements), impression.
- **PATRON** : accès total, seul à pouvoir créer/modifier/supprimer les comptes utilisateurs, les prix des chambres, le menu et ses prix, les paramètres généraux.
- **CLIENT** (site public, pas de compte) : lecture des chambres disponibles et du menu, création d'une demande de réservation uniquement.

### 9.2 Comptes ouverts et sous-comptes (cafétaria) — logique impérative

Implémente exactement ce comportement, déjà validé avec le client :

- Un `CompteCafeteria` reste `OUVERT` du premier article commandé jusqu'à l'encaissement — jamais une vente immédiate par commande.
- Chaque nouvelle commande du même client s'ajoute comme nouvelle `LigneCommande` sur le `SousCompte` actif, sans jamais créer une nouvelle vente.
- Une table peut avoir plusieurs `SousCompte` (plusieurs personnes consommant différemment) ; le serveur choisit le sous-compte au moment d'ajouter un article.
- À l'encaissement (`POST /cafeteria/comptes/:id/encaisser`), trois modes doivent être supportés : `GROUPE` (une seule facture pour tout le compte), `PAR_SOUS_COMPTE` (une facture par sous-compte), `PARTAGE_EGAL` (le total divisé également entre N personnes indiquées par le serveur).
- Une vente peut être réglée en `FACTURE_CHAMBRE` : dans ce cas, le montant remonte automatiquement sur la `Facture` de la chambre concernée (`VenteCafeteria.chambreLiee`), sans double saisie côté réception.
- Aucune suppression physique d'une vente ou d'une commande : uniquement `annuleLe` + `motifAnnulation`.

### 9.3 Matrice CRUD (reprends-la exactement dans les Guards et policies RLS)

| Module | Réceptionniste | Cafétaria | Patron | Client (web) |
|---|---|---|---|---|
| Chambres (types, prix) | Lecture | — | Créer/Modifier/Supprimer | Lecture (disponibilité) |
| Statut chambre | Modifier | — | Modifier | Lecture |
| Réservations | Créer/Modifier/Annuler | — | Lecture/Modifier/Annuler (tout) | Créer une demande |
| Check-in/Check-out | Créer | — | Lecture | — |
| Facture séjour | Créer/Imprimer | — | Lecture/Annuler avec motif | — |
| Menu cafétaria | — | Lecture | Créer/Modifier/Supprimer | Lecture |
| Ventes cafétaria | — | Créer/Imprimer | Lecture/Annuler avec motif | — |
| Stock | — | Créer mouvement/Lecture | Lecture/Ajuster/Supprimer produit | — |
| Comptes utilisateurs | — | — | Créer/Modifier/Désactiver | — |
| Rapports/recettes | Ses opérations | Ses opérations | Tout, toutes périodes | — |
| Paramètres hôtel | — | — | Modifier | — |

### 9.4 Gestion multi-devises (USD / Franc congolais) — règle impérative

L'hôtel fixe ses prix chambre par chambre et produit par produit, chacun dans **sa propre devise** (`Devise.USD` ou `Devise.CDF`, voir section 7) — ce n'est jamais un réglage global de l'application. Implémente exactement ce comportement :

- **Affichage** : chaque `RoomCard`, chaque tuile de produit cafétaria et chaque `OrderLine` affiche le prix avec le bon symbole selon sa propre devise — `$ 45.00` pour une chambre en USD, `20 000 FC` pour une chambre en CDF (formate le franc congolais sans décimales et avec des espaces comme séparateurs de milliers, jamais de symbole `$`). Ne convertis jamais un prix affiché dans une autre devise « pour simplifier » — le personnel doit toujours voir la devise réelle du prix.
- **Un même compte cafétaria (ou une même facture de chambre) peut mélanger des articles en USD et en CDF.** N'additionne jamais les deux : calcule et affiche systématiquement deux totaux séparés (`montantTotalUSD` et `montantTotalCDF`), jamais un total unique fusionné à l'aide d'un taux de change — c'est une erreur comptable formelle à éviter absolument dans ce système.
- **Taux de change (`TauxChange`)** : géré uniquement par le PATRON depuis le tableau de bord (un formulaire simple : « 1 USD = ... CDF », historisé). Ce taux sert à deux choses seulement : (1) afficher une **estimation informative** de la contre-valeur d'un total (ex. « ≈ 71 $ » affiché en petit sous un total en CDF, jamais utilisé comme le total légal) ; (2) calculer le rendu de monnaie lors d'un **paiement croisé** (voir point suivant). Il n'est jamais utilisé pour fusionner deux totaux dans les rapports du patron : le tableau de bord affiche « Recette du jour : 320 $ et 540 000 FC », jamais une somme unique.
- **Paiement croisé** : un client peut régler une note libellée dans une devise avec des billets de l'autre (ex. payer une chambre à 45 $ entièrement en francs congolais). L'écran d'encaissement (réception ET cafétaria) doit alors : demander la devise réellement remise (`deviseRegleeParClient`) et le montant remis (`montantRegleParClient`), appliquer le taux du jour (`TauxChange` le plus récent, copié dans `tauxChangeApplique` pour garder une trace immuable de ce qui a été utilisé ce jour-là) et calculer la monnaie à rendre, en précisant dans quelle devise elle doit être rendue (demander explicitement au caissier, car on peut rendre la monnaie dans l'une ou l'autre devise selon ce qu'il a en caisse). Affiche toujours clairement à l'écran : montant dû (devise d'origine), montant reçu (devise remise), monnaie à rendre (devise choisie par le caissier).
- **Reçus imprimés** : chaque ligne d'article affiche sa propre devise ; le pied du ticket affiche un total par devise présente sur ce ticket (jamais de total fusionné), et, si un paiement croisé a eu lieu, une ligne supplémentaire « Réglé en {devise} : {montant} — Monnaie rendue : {montant} {devise} » (voir gabarits complets section 11).
- **Stock** : les mouvements de stock (`MouvementStock`) ne portent pas de devise — seul le prix de vente du produit en porte une, la quantité en stock reste une unité neutre (bouteilles, portions).
- **Site public** : affiche les prix des chambres et du menu exactement dans leur devise d'origine, jamais convertis, avec éventuellement la mention discrète du taux du jour à titre indicatif si le patron l'active dans les paramètres.

---

## 10. Mode hors ligne — spécification technique complète (Option 1, sans PowerSync)

Ce mécanisme est le cœur du produit ; implémente-le avec le même sérieux que le reste, pas comme une fonctionnalité secondaire.

### 10.1 Base locale (SQLite) sur chaque appareil réception/cafétaria

Sur chaque appareil (Electron desktop ou React Native mobile), crée une base SQLite miroir des tables synchronisées listées en section 7, avec en plus, pour chaque table :
- `local_id` (UUID généré côté client, utilisé comme clé primaire locale)
- `remote_id` (rempli après confirmation du serveur, `NULL` tant que la ligne n'a pas été synchronisée)
- `is_dirty` (booléen : la ligne a des changements non encore envoyés)
- `sync_status` (`PENDING`, `SYNCED`, `CONFLICT`, `ERROR`)

Toute action de l'utilisateur (créer une réservation, ajouter une ligne de commande, changer le statut d'une chambre, enregistrer un mouvement de stock) doit **immédiatement** s'écrire dans SQLite local et se refléter à l'écran, sans jamais attendre une réponse réseau.

### 10.2 File d'attente de synchronisation

Crée une table locale `sync_queue` : `id`, `entity_type`, `local_id`, `operation` (`CREATE`/`UPDATE`), `payload` (JSON), `created_at`, `attempts`, `last_error`.

Un service en arrière-plan (`packages/sync-engine`), actif dans les deux apps (mobile et desktop) :
1. Détecte la connectivité (vérification périodique, toutes les 15 à 30 secondes, d'un `ping` léger vers l'API — pas seulement l'état réseau du système, qui peut être trompeur).
2. Dès qu'une connexion est détectée, envoie la file `sync_queue` dans l'ordre chronologique via `POST /sync/push`, par lots.
3. Sur succès, marque la ligne `SYNCED`, remplit `remote_id`, retire l'entrée de la file.
4. Sur échec réseau, réessaie avec un backoff exponentiel (5s, 15s, 30s, 1min, puis toutes les 2 min).
5. Récupère aussi les changements distants via `GET /sync/pull?since=<timestamp>` (créés par les autres postes ou par le patron/site public) et les applique localement.

### 10.3 Endpoints de synchronisation côté API

- `POST /sync/push` : reçoit un tableau d'opérations `{entity_type, local_id, operation, payload, clientUpdatedAt}`. Pour chaque opération, applique la règle de résolution de conflit (10.4), écrit en base, et renvoie `{local_id, remote_id, syncVersion, status}` pour chacune.
- `GET /sync/pull?since=<timestamp>&entity_types=...` : renvoie toutes les lignes modifiées depuis `since` pour les types demandés, avec leur `syncVersion`.

### 10.4 Résolution de conflits

Règle simple et explicite (pas de fusion automatique complexe, le personnel ne doit jamais voir une donnée « fusionnée » silencieusement) :
- Pour une **création** (nouvelle réservation, nouvelle vente, nouveau mouvement de stock) : jamais de conflit, chaque création a un `local_id` unique, elle est simplement ajoutée.
- Pour une **modification** (ex. changement de statut de chambre) : comparaison de `syncVersion`. Si la version serveur a changé depuis la dernière lecture locale, **le serveur gagne** (dernière écriture serveur prioritaire sur les champs de statut/prix) et la modification locale non appliquée apparaît dans un écran « Conflits à vérifier » visible du réceptionniste/caissier concerné, jamais silencieusement perdue.
- Les données financières (une `Facture` ou une `VenteCafeteria` déjà créée) ne sont **jamais réécrites** par la synchronisation, uniquement complétées (ex. ajout d'un numéro de reçu) — toute correction passe par l'endpoint d'annulation avec motif.

### 10.5 Indicateurs visuels obligatoires

Chaque écran réception/cafétaria doit montrer, discrètement mais clairement, l'état de synchronisation : un petit indicateur (point vert = synchronisé, orange = en attente de connexion avec le nombre d'opérations en file, rouge = erreur de synchronisation à vérifier). Ne jamais bloquer une vente ou une réservation en attendant la synchronisation.

---

## 11. Impression thermique — spécification complète

### 11.1 Bibliothèques

- Mobile (React Native) : `react-native-esc-pos-printer` (ou équivalent ESC/POS Bluetooth) pour l'appairage et l'envoi des commandes.
- Desktop (Electron) : `node-thermal-printer` dans le process principal, exposé au renderer via IPC (`ipcMain.handle('print-receipt', ...)`).
- Crée un écran « Imprimante » dans les Paramètres de chaque app (réception et cafétaria séparément) permettant de : lister les imprimantes Bluetooth/USB détectées, sélectionner celle à utiliser, imprimer un ticket de test.

### 11.2 Contenu du reçu — Réception (facture de séjour)

```
          HOTEL CHICAGO
      Quartier Congo ya Sika
       Kasindi, Nord-Kivu, RDC
--------------------------------
Reçu n° : {numeroRecu}
Date : {date} {heure}
Reçu par : {nomReceptionniste}
--------------------------------
Client : {nomClient}
Chambre : {numeroChambre} ({type})
Arrivée : {dateArrivee}
Départ : {dateDepart}
Nombre de nuits : {n}
--------------------------------
Prix/nuit :         {prix} {devise}
Acompte versé :     {acompte} {devise}
--- Consommations cafétaria liées (si présentes, chacune dans sa devise) ---
{description}       {montant} {devise}
--------------------------------
TOTAL À PAYER EN USD :  {montantTotalUSD} $      (si > 0)
TOTAL À PAYER EN CDF :  {montantTotalCDF} FC     (si > 0)
--------------------------------
Mode de paiement : {mode}
Réglé en {deviseRegleeParClient} : {montantRegleParClient}   (si paiement croisé)
Monnaie rendue :   {monnaie} {deviseChoisie}       (si applicable)
      Merci de votre visite !
```

### 11.3 Contenu du reçu — Cafétaria (vente)

```
      HOTEL CHICAGO — Cafétaria
      Quartier Congo ya Sika
       Kasindi, Nord-Kivu, RDC
--------------------------------
Reçu n° : {numeroRecu}
Date : {date} {heure}
Servi par : {nomServeur}
Table/Compte : {tableOuNom}
--------------------------------
{quantite}x {nomProduit}    {prixLigne} {devise}
{quantite}x {nomProduit}    {prixLigne} {devise}
...
--------------------------------
TOTAL EN USD :   {montantTotalUSD} $     (si > 0)
TOTAL EN CDF :   {montantTotalCDF} FC    (si > 0)
--------------------------------
Mode de paiement : {mode}
Réglé en {deviseRegleeParClient} : {montantRegleParClient}   (si paiement croisé)
Monnaie rendue :   {monnaie} {deviseChoisie}       (si applicable)
      Merci de votre visite !
```

Formate ces deux reçus avec les commandes ESC/POS : en-tête centré et en gras (nom et adresse de l'hôtel), séparateurs en ligne de tirets, alignement à droite des montants (colonnes tabulaires), coupe automatique du papier en fin de ticket. N'imprime jamais une ligne « TOTAL EN USD » ou « TOTAL EN CDF » si son montant est nul — un ticket entièrement en une seule devise n'affiche qu'un seul total, sans ligne vide inutile. Le franc congolais s'imprime toujours sans décimales (`20 000 FC`, jamais `20 000,00 FC`) ; le dollar toujours avec deux décimales (`45.00 $`).

Le numéro de reçu doit être une séquence continue et unique par type (`REC-YYYYMMDD-####` pour la réception, `CAF-YYYYMMDD-####` pour la cafétaria), généré côté serveur à la synchronisation pour éviter les doublons entre postes hors ligne — tant qu'un ticket n'est pas synchronisé, imprime un numéro temporaire préfixé `TEMP-` et réimprime automatiquement le ticket définitif dès que le numéro officiel est reçu, si l'utilisateur le demande.

---

## 12. Charte graphique / design system — à respecter à la lettre

Utilise exactement ces jetons (déjà validés avec le client à partir du logo de l'hôtel) dans `packages/ui`, avec un thème clair et un thème sombre. N'improvise aucune couleur en dehors de cette liste.

**Principe impératif à ne jamais perdre de vue : le nombre de jetons ci-dessous (une vingtaine) n'est PAS le nombre de couleurs que l'utilisateur voit à l'écran.** La grande majorité de chaque écran reste neutre (`surface-*`, `border`, `ink`, `ink-muted`) — pas de couleur du tout. Les couleurs vives n'apparaissent que par petites touches, jamais en grand aplat : `accent` uniquement sur l'unique bouton principal d'un écran, `rust` uniquement en texte/icône/contour, et les cinq couleurs de statut (`success`/`warning`/`danger`/`info`/`neutral`) uniquement sur un petit badge de quelques millimètres. Si en construisant un écran tu te retrouves avec plus de deux couleurs vives visibles en même temps sur la même vue (hors badges de statut, qui peuvent coexister car ils codent une information différente pour chaque ligne), c'est un signe que tu as mal appliqué la charte — reviens en arrière plutôt que d'ajouter une nouvelle couleur.

### 12.1 Couleurs — thème clair

| Jeton | Valeur | Usage |
|---|---|---|
| `surface-100` | `#fbf5ec` | Fond de page |
| `surface-200` | `#f3e7d3` | Cartes, panneaux |
| `surface-300` | `#ecd9ba` | État actif/pressé |
| `border` | `#ddc9a8` | Séparateurs, contours |
| `ink` | `#2a1f15` | Texte principal |
| `ink-muted` | `#6e5d49` | Texte secondaire |
| `accent` (couleur principale) | `#c98a2e` | Action principale, boutons primaires, focus |
| `accent-strong` | `#a86f1f` | Survol du bouton primaire |
| `rust` (couleur secondaire) | `#9a3d1e` | Titres, liens, contour des boutons secondaires |
| `rust-strong` | `#7a2e15` | Survol des éléments secondaires |
| `on-accent` | `#241a12` (fixe) | Texte sur fond `accent` |
| `success` | `#2f6b41` / texte blanc | Chambre libre, paiement confirmé |
| `warning` | `#9c6a1e` / texte blanc | Réservée, stock bas |
| `danger` | `#9e3226` / texte blanc | Occupée, erreur, annulation |
| `info` | `#2e5c79` / texte blanc | Compte cafétaria ouvert |
| `neutral` | `#4f4959` / texte blanc | En nettoyage, hors service |

### 12.2 Couleurs — thème sombre

| Jeton | Valeur |
|---|---|
| `surface-100` | `#1b140d` |
| `surface-200` | `#241b12` |
| `surface-300` | `#2f2419` |
| `border` | `#3c2e1f` |
| `ink` | `#f2e7d8` |
| `ink-muted` | `#c2af97` |
| `accent` | `#d79a44` |
| `accent-strong` | `#e6ac5c` |
| `rust` | `#e2825a` (texte/icônes uniquement, jamais en grand aplat en mode sombre) |
| `rust-strong` | `#ef9b74` |
| `on-accent` | `#241a12` (fixe, identique au thème clair) |
| `success` / `warning` / `danger` / `info` / `neutral` | identiques au thème clair (déjà assez sombres pour porter du texte blanc dans les deux thèmes) |

Règle impérative : jamais de blanc pur (`#ffffff`) ni de noir pur (`#000000`) pour un fond de page, dans aucun des deux thèmes — c'est la raison d'être de cette palette (confort visuel en usage prolongé).

### 12.3 Typographie

- **Fraunces** (titres pleine page uniquement : écran de connexion, accueil du site public, titre du tableau de bord) — `font-weight: 500/600`.
- **Public Sans** (tout le reste de l'interface : boutons, champs, tableaux, menus) — `font-weight: 400/600`.
- **IBM Plex Mono** (uniquement les nombres alignés : prix, totaux, numéros de reçu/chambre).

Charger via Google Fonts : `https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Public+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap`.

Échelle de texte : `display-lg` 34px/600, `display-md` 26px/600, `heading` 20px/600, `subheading` 16px/600, `body` 15px/400, `body-strong` 15px/600, `caption` 13px/400, `label` 12px/600 (majuscules, letter-spacing 0.04em), `price` 15px/500 (mono), `price-lg` 22px/600 (mono), `code` 13px/400 (mono).

### 12.4 Espacement et formes

Espacements : `space-1` 4px, `space-2` 8px, `space-3` 12px, `space-4` 16px, `space-5` 24px, `space-6` 32px, `space-7` 48px. Rayons : `radius-sm` 6px (champs), `radius-md` 10px (boutons, cartes), `radius-lg` 16px (grandes cartes, modales), `radius-pill` 999px (badges).

### 12.5 Composants partagés à construire dans `packages/ui`

`Button` (variants `primary`/`secondary`/`danger`, tailles `sm`/`md`/`lg`), `StatusBadge` (couleur + mot, jamais la couleur seule), `RoomCard` (numéro, type, prix, statut), `OrderLine` (article, quantité, total), `DashboardStat` (libellé, grand chiffre, précision). Chaque composant doit exister en version web (React) et en version React Native, avec la même API de props, pour un rendu visuel identique sur toutes les surfaces.

Ajoute à `packages/ui` une fonction utilitaire partagée `formatMontant(montant: Decimal, devise: 'USD' | 'CDF')` — utilisée par `RoomCard`, `OrderLine` et `DashboardStat` partout où un prix s'affiche — qui retourne `"45.00 $"` pour l'USD et `"20 000 FC"` pour le CDF (voir les règles de formatage exactes section 9.4 et 11.3). Aucun composant ne doit formater un montant « à la main » : tout passe par cette fonction, pour garantir une présentation identique sur les quatre surfaces.

### 12.6 Logo

Le logo « Hotel Chicago » (monogramme doré-roux + texte gravé) a un fond blanc intégré au fichier fourni : ne le pose que sur un fond clair (une carte `surface-100`/`surface-200` claire, ou une plaque blanche en thème sombre). Réserve-le à l'écran de connexion, au site public et aux documents imprimés.

---

## 13. Site web public — exigences UI/UX

Le site public doit avoir le niveau de finition d'un vrai site d'hôtel professionnel moderne, pas d'un simple site vitrine basique. Inspire-toi explicitement du niveau d'exécution (grandes images plein écran, animations d'entrée fluides, typographie soignée, transitions au défilement) de ces sites d'hôtels de référence, tout en gardant la charte graphique propre à Hotel Chicago (section 12), jamais en copiant leur identité visuelle :

- Ace Hotel — https://www.acehotel.com
- 1 Hotels — https://www.1hotels.com
- citizenM — https://www.citizenm.com
- The Standard Hotels — https://www.standardhotels.com
- Aman — https://www.aman.com
- Six Senses — https://www.sixsenses.com

Exigences précises pour la page d'accueil :

- Un **hero plein écran** avec un carrousel de photos de l'hôtel qui défile automatiquement avec un fondu (crossfade) fluide, un léger effet de zoom lent (effet Ken Burns) sur chaque image, le nom de l'hôtel et un slogan en typographie `display` (Fraunces), et un bouton d'action clair (« Réserver une chambre »).
- Une **animation d'entrée** au chargement de la page (fondu + léger décalage vers le haut des éléments du hero, décalés dans le temps les uns après les autres — stagger).
- Des **sections qui s'animent au défilement** (fade-in + translation légère quand la section entre dans le viewport) : présentation de l'hôtel, galerie de chambres avec leurs prix et disponibilité en temps réel (connectée à `GET /public/chambres-disponibles`), présentation du menu de la cafétaria (connectée à `GET /public/menu`), formulaire de pré-réservation, section contact/localisation avec carte.
- Utilise Framer Motion (ou une bibliothèque équivalente compatible Next.js) pour toutes ces animations — vérifie que le site reste rapide même sur une connexion lente (compression d'images, lazy loading), puisque les visiteurs depuis Kasindi peuvent avoir une connexion faible.
- Respecte `prefers-reduced-motion` : désactive les animations non essentielles si l'utilisateur l'a demandé.
- Site entièrement responsive (mobile, tablette, desktop) et bilingue prêt à l'extension (structure i18n en place, contenu en français uniquement pour le lancement).
- Chaque prix de chambre et de plat/boisson s'affiche dans **sa propre devise** telle qu'enregistrée en base (`$` pour USD, `FC` pour CDF, voir section 9.4) — ne convertis jamais un prix affiché sur le site public.
- La section contact/localisation affiche l'adresse réelle de l'hôtel :

```
Hôtel Chicago
Quartier Congo ya Sika
Kasindi, Province du Nord-Kivu
République Démocratique du Congo
```

---

## 14. Authentification et sécurité

- Utilise Supabase Auth pour la connexion (email/mot de passe pour le personnel, gestion des comptes exclusivement par le PATRON, jamais d'auto-inscription).
- Chaque appareil desktop/mobile reste connecté en permanence avec un token de longue durée rafraîchi automatiquement, pour ne pas obliger le personnel à se reconnecter après une coupure réseau.
- Les Guards NestJS et les policies RLS Supabase doivent être strictement synchronisés avec la matrice de la section 9.3 — écris un test automatisé qui vérifie qu'un rôle `CAFETARIA` reçoit bien un `403` sur les routes `Chambres`/`Reservations`, et inversement pour `RECEPTIONNISTE` sur `Produits`/`Stock`.

---

## 15. Déploiement (Render)

Fournis un `render.yaml` à la racine décrivant :
- un Web Service `hotel-chicago-api` (Node, build `pnpm --filter api build`, start `pnpm --filter api start:prod`), variables d'environnement listées en section 6 configurées comme secrets Render (jamais en clair dans le repo) ;
- un Web Service `hotel-chicago-web` (Next.js, build `pnpm --filter web build`, start `pnpm --filter web start`) ;
- déploiement automatique sur chaque push sur la branche `main` ;
- health check sur `/health` côté API.

Les apps `desktop` (Electron, packagée avec `electron-builder` pour Windows/Linux) et `mobile` (React Native, build Android via EAS ou Gradle direct) ne sont pas hébergées sur Render : elles sont distribuées comme installeurs/APK, configurées pour pointer vers l'URL Render de l'API.

---

## 16. Plan de réalisation (livre le projet dans cet ordre)

1. Monorepo, schéma Prisma (avec la gestion multi-devises USD/CDF dès le départ, section 9.4 — ne pas l'ajouter après coup), connexion Supabase de production, module Auth, matrice de permissions et tests associés.
2. Module Réception complet (chambres, réservations, check-in/out, facturation) sur desktop, avec impression.
3. Module Cafétaria complet (comptes ouverts, sous-comptes, stock) sur desktop, avec impression.
4. Mode hors ligne (SQLite local + moteur de synchronisation) intégré aux deux modules ci-dessus.
5. Portage des deux modules en React Native (mobile), réutilisation maximale de `packages/ui` et `packages/sync-engine`.
6. Tableau de bord Patron (desktop + mobile).
7. Site web public (Next.js) avec le niveau de finition demandé section 13.
8. Déploiement Render (API + site public), configuration finale des `.env` de production, tests de bout en bout en conditions réelles de coupure réseau (couper le Wi-Fi en plein usage et vérifier qu'aucune vente n'est perdue).

Livre un `README.md` racine expliquant comment lancer chaque app en développement, comment déployer, et où se trouvent les identifiants attendus dans `.env`.

---

## 17. Exigences de qualité

- Code TypeScript strict (`strict: true`), pas de `any` non justifié.
- Gestion d'erreur systématique et messages utilisateur en français, concrets, jamais « une erreur est survenue » sans précision.
- Aucune suppression physique de donnée financière ou de réservation — uniquement des annulations tracées avec motif (rappel de la section 9).
- Commits Git atomiques et clairs au fur et à mesure de l'avancement, pas un unique commit final.
- Documente dans `DECISIONS.md` toute hypothèse prise en l'absence d'information explicite dans ce prompt.

---

Construis maintenant l'application dans son intégralité en suivant ce prompt du début à la fin, en commençant par la section 16 (plan de réalisation), sans t'arrêter pour demander confirmation sauf si une décision est réellement bloquante et irréversible.
