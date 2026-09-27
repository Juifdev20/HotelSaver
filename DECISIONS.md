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

### Phase 2 — sous-découpage : backend d'abord, Electron/impression plus tard

La section 16 définit la Phase 2 comme « Module Réception complet (chambres,
réservations, check-in/out, facturation) **sur desktop, avec impression** » —
un seul bloc mêlant logique métier, UI Electron et intégration matérielle
d'imprimantes thermiques. Comme pour la Phase 1, ce bloc a été sous-découpé :
cette passe construit la logique métier réelle côté `apps/api` (Chambres,
Réservations, Factures — CRUD complet, règles métier, tests), **sans**
l'application Electron ni l'impression thermique, qui nécessitent un travail
UI/matériel substantiel et distinct. `apps/desktop` reste un espace réservé
(voir son README) jusqu'à une passe dédiée « Phase 2b ».

### Interprétation de la matrice de permissions face à « PATRON : accès total »

La matrice de la section 9.3 ne liste littéralement pas « Créer » dans les
cellules PATRON pour les lignes Réservations, Check-in/Check-out et Facture
séjour (seul RECEPTIONNISTE a « Créer »). Question posée explicitement à
l'utilisateur, car l'impact produit est réel (le patron pourrait sinon être
incapable de faire lui-même un check-in ou une facture) : **décision =
PATRON a accès à toutes les actions de ces trois modules**, conformément à
l'énoncé général de la section 9.1 (« PATRON : accès total »). Les cellules
de la matrice qui omettent « Créer » pour PATRON sont donc lues comme un
raccourci décrivant l'usage quotidien typique, pas comme une exclusion
stricte. Implémenté dans `ChambresController`/`ReservationsController`/
`FacturesController` : `@Roles(Role.RECEPTIONNISTE, Role.PATRON)` sur toutes
les routes de ces trois modules, sauf les actions strictement administratives
sur les chambres (créer/modifier prix-type/supprimer une chambre), qui
restent PATRON seul, conformément à la ligne « Chambres (types, prix) ».

### Champs ajoutés au schéma (incohérence entre sections 7 et 8/17)

Le schéma Prisma de la section 7 n'inclut pas de champs `annuleLe`/
`motifAnnulation` sur `Reservation`, ni de champ pour la devise/le montant de
la monnaie rendue sur `Facture` — alors que la section 8 exige un endpoint
`POST /:id/annuler` traçant un motif pour **toutes** les données non
supprimables, et que la section 9.4 exige d'afficher la monnaie rendue et sa
devise. Ajoutés en Phase 2 (migration
`20260924112641_phase2_reservation_facture_fields`, appliquée en production) :
- `Reservation.annuleLe: DateTime?`, `Reservation.motifAnnulation: String?`
- `Facture.deviseMonnaieRendue: Devise?`, `Facture.montantMonnaieRendue: Decimal?`

### Calcul du montant dû et du paiement croisé (non spécifié précisément)

La section 7 décrit les champs de `Facture` mais pas la formule de calcul.
Implémenté dans `FacturesService.create()` :
`montantChambre = prixParNuit × nombre de nuits` (arrondi à l'entier
supérieur en jours) ; `montantDu = max(0, montantChambre − acompte)`, placé
dans le panier de devise correspondant à `Chambre.devise` (l'autre panier
reste à 0 tant que la cafétaria — Phase 3 — n'alimente pas la facture). Le
paiement croisé (`apps/api/src/factures/encaissement.util.ts`, testé
isolément) suppose un dû dans une seule devise (le cas mixte, qui n'existera
qu'avec les ventes cafétaria liées, est explicitement hors scope Phase 2 —
`FacturesService` ne gère pas encore `reservationLieeId`). Une facture ne
peut être créée que pour une réservation `EN_COURS` ou `TERMINEE` (le client
doit avoir fait son check-in).

### Bug RLS trouvé et corrigé en testant le vrai endpoint DELETE

Le trigger `controle_ecriture_chambre` (Phase 1) faisait `return NEW;`
inconditionnellement en fin de fonction. Sur un trigger `BEFORE DELETE`,
`NEW` est toujours `NULL` en PL/pgSQL (seul `OLD` existe) — et renvoyer
`NULL` depuis un trigger `BEFORE DELETE` annule silencieusement la
suppression pour Postgres, **quel que soit le rôle**. Résultat concret :
`DELETE /chambres/:id` échouait toujours avec une erreur Prisma P2025
(« Record to delete does not exist »), y compris pour PATRON, alors que
`ChambresService.remove()` avait pourtant bien vérifié que la ligne existait
juste avant. Trouvé en testant l'endpoint réel contre la vraie base (pas
seulement via les tests unitaires, qui mockent Prisma et ne peuvent pas
détecter un trigger SQL cassé) : suppression testée manuellement, échec
inattendu, cause isolée en une itération de debug SQL direct. Corrigé dans
`packages/database/prisma/rls-policies.sql` (`return OLD` sur `TG_OP =
'DELETE'`) et appliqué directement en production. En profite pour ajouter la
policy RLS `chambre_delete_patron` qui manquait (la section 9.3 autorise
explicitement PATRON à supprimer une chambre ; l'absence de policy DELETE
aurait de toute façon tout refusé par défaut au niveau RLS, cohérent avec
l'ancien commentaire erroné du fichier qui disait « jamais de suppression
physique d'une chambre » — une confusion avec la règle qui s'applique aux
données *financières*, pas aux chambres elles-mêmes).

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

`SupabaseAuthGuard` (`apps/api/src/common/guards/supabase-auth.guard.ts`)
vérifie la signature du jeton, extrait le `sub` (id Supabase Auth de
l'utilisateur), puis va chercher le rôle réel dans la table `Utilisateur`
(jamais dans le jeton lui-même — le rôle métier vit dans notre base).

**Vérification via JWKS (ES256), pas via un secret partagé — hypothèse de
Phase 1 corrigée.** La Phase 1 supposait que `JWT_SECRET` (le secret legacy
HS256) signait les jetons, et le signalait déjà comme point à vérifier. Le
premier vrai login testé (en construisant l'app Electron) a montré l'inverse :
ce projet Supabase signe en **ES256** avec des clés asymétriques
(`"alg":"ES256","kid":...` dans l'en-tête), publiées sur
`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Tous les tests passaient
jusque-là uniquement parce qu'ils signaient eux-mêmes des jetons HS256 avec
le même secret — un vrai utilisateur n'aurait jamais pu se connecter.

Corrigé : la vérification est derrière une interface injectable
(`VERIFICATEUR_JWT`, `apps/api/src/common/auth/verificateur-jwt.ts`).
En production, `VerificateurJwtSupabase` (`jsonwebtoken` + `jwks-rsa`, choisis
plutôt que `jose` car `jose` v5 est ESM-only alors que `apps/api` est en
CommonJS) récupère et met en cache la clé publique par `kid`. Les tests
remplacent ce fournisseur par `VerificateurJwtHs256` pour continuer à signer
leurs propres jetons sans dépendre du réseau. `JWT_SECRET` n'est plus utilisé
nulle part en production et a été retiré de `.env.example`. Vérifié contre la
vraie instance : un jeton ES256 émis par un vrai login Supabase est accepté
(`/auth/me` → 200 avec le bon rôle) ; un jeton HS256 forgé avec l'ancien
secret est désormais refusé (401).

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

## Phase 3 — Cafétaria (Produits, Stock, Comptes/Ventes)

Même sous-découpage que les Phases 1-2 : cette passe construit la logique
métier réelle côté `apps/api` (Produits, Stock, Comptes cafétaria/
sous-comptes/lignes/encaissement), sans Electron ni impression thermique
(Phase 2b/3b, non traitée). `ProduitsModule`/`StockModule` suivent
strictement la matrice 9.3 (RECEPTIONNISTE exclu partout) ; `CafeteriaModule`
donne à CAFETARIA et PATRON un accès identique à tout le cycle de vie normal
(ouverture, sous-comptes, lignes, encaissement), cohérent avec l'interprétation
« PATRON : accès total » déjà actée en Phase 2 — seule l'annulation d'une
vente reste PATRON seul (la matrice ne donne « Annuler avec motif » qu'à lui,
sans ambiguïté cette fois, contrairement à Réservations/Factures).

**Hypothèses de modélisation** (non spécifiées littéralement section 7/8) :
- Un `CompteCafeteria` reçoit automatiquement un premier `SousCompte` nommé
  « Personne 1 » à l'ouverture, pour éviter une étape manuelle au cas courant
  (une seule personne) — section 9.2 ne le précise pas explicitement.
- `AJUSTEMENT` (mouvement de stock) prend un delta signé (positif ou négatif)
  directement dans `quantite` ; `ENTREE`/`SORTIE_VENTE`/`PERTE` prennent une
  quantité positive, le sens étant déjà porté par `type`.
- Chaque `LigneCommande` ajoutée à un compte déclenche automatiquement un
  `MouvementStock` de type `SORTIE_VENTE` (transaction unique) — la vente
  cafétaria consomme réellement du stock, même si section 8 range Stock et
  Cafétaria dans des endpoints séparés.
- `POST /cafeteria/comptes/:id/encaisser` en mode `PAR_SOUS_COMPTE` crée une
  `VenteCafeteria` par sous-compte ayant au moins une ligne, sans lien persisté
  vers ce sous-compte (le schéma section 7 n'a pas de `sousCompteId` sur
  `VenteCafeteria`) — acceptable car le reçu s'imprime au moment même de
  l'encaissement (Phase 2b), pas rétroactivement.
- Le **paiement croisé** (section 9.4) n'est calculé que pour le mode
  `GROUPE` : `PAR_SOUS_COMPTE`/`PARTAGE_EGAL` génèrent plusieurs ventes, et le
  schéma ne permet pas d'associer un règlement différent à chacune dans un
  seul appel. `PARTAGE_EGAL` répartit le total en parts égales via
  `apps/api/src/cafeteria/partage.util.ts`, qui travaille en plus petite unité
  de la devise (centimes USD / francs CDF entiers) pour que la somme des
  parts reconstitue exactement le total, sans perte d'arrondi.
- `FacturesService.create()` (Phase 2) additionne désormais les
  `VenteCafeteria` liées via `reservationLieeId` (non annulées) dans le total
  de la chambre, par devise, jamais fusionnées — c'est le mécanisme concret
  qui réalise « le montant remonte automatiquement sur la Facture de la
  chambre » (section 9.2). Vérifié de bout en bout contre la vraie base :
  chambre à 40 $ + 12 $ de consommations cafétaria FACTURE_CHAMBRE = 52 $
  exactement sur la facture finale.
- `VenteCafeteria` a reçu les mêmes colonnes `deviseMonnaieRendue`/
  `montantMonnaieRendue` que `Facture` (Phase 2), pour la même raison
  (traçabilité du choix du caissier) — migration `phase3_ventecafeteria_change_fields`.

### Deux bugs réels trouvés en testant contre la vraie base (pas par les tests unitaires mockés)

1. **Numérotation des reçus basée sur `COUNT()`, pas sur le dernier numéro.**
   `genererNumeroRecu()` (Cafétaria et Factures) comptait les lignes du jour et
   ajoutait 1, en supposant une séquence sans trou. Un bug antérieur (voir
   point 2) avait laissé des trous (0001, 0002, 0003, 0005, 0007) ; le
   `COUNT()` valait 5, produisait ensuite un numéro déjà pris ailleurs dans la
   boucle → violation de contrainte unique Postgres, remontée comme une
   `500 Internal server error` brute côté API. Corrigé dans les deux services :
   chercher le **plus grand numéro déjà utilisé aujourd'hui**
   (`findFirst` + `orderBy: numeroRecu desc` + `startsWith` le préfixe du
   jour) plutôt qu'un compte de lignes — robuste même en présence de trous.
   Un test de non-régression reproduit exactement ce scénario dans les deux
   suites de tests (`factures.service.spec.ts`, `cafeteria.service.spec.ts`).
2. **Double-encaissement possible sur le même compte (course critique).**
   `encaisser()` vérifiait `compte.statut === 'OUVERT'` sur une lecture faite
   *avant* d'ouvrir la transaction Prisma. Deux appels concurrents (ou une
   requête HTTP interrompue côté client mais toujours en cours d'exécution
   côté serveur, suivie d'une nouvelle tentative manuelle — exactement ce qui
   s'est produit pendant les tests) passent alors tous les deux cette
   vérification et tentent chacun de créer des ventes, provoquant la collision
   du point 1. Corrigé par un compare-and-swap atomique en tout début de
   transaction : `tx.compteCafeteria.updateMany({ where: { id, statut:
   'OUVERT' }, data: { statut: 'FERME', ... } })`, et si `count === 0`
   (quelqu'un d'autre a fermé le compte entre-temps), l'appel échoue
   proprement avec un `409 Conflict` au lieu de générer des ventes en double.

## Dashboard et Public (section 8) — complète la surface API sans toucher à l'UI

Après les Phases 2-3 (Réception + Cafétaria), les deux derniers modules
purement backend listés section 8 ont été construits — `DashboardModule` et
`PublicModule` — plutôt que de passer directement à l'Electron/impression
différé depuis deux passes (Phase 2b/3b, toujours non traité). Aucune
décision de framework UI n'est nécessaire pour ces deux modules, donc pas de
risque de mal cadrer une grosse pièce sans confirmation.

- **`DashboardModule`** applique littéralement la ligne « Rapports/recettes »
  de la section 9.3 : RECEPTIONNISTE et CAFETARIA ne voient que « leurs »
  opérations, PATRON voit tout, sans jamais fusionner USD/CDF (section 9.4)
  ni chambres/cafétaria pour un rôle non-PATRON. Comme `Facture` n'a pas de
  colonne `createdBy` (absent du schéma section 7, contrairement à
  `Reservation`), le filtrage RECEPTIONNISTE passe par
  `reservation: { createdBy: userId }` plutôt que d'ajouter encore une
  colonne — cette fois la donnée existe déjà ailleurs dans le graphe, pas
  besoin de migration. `occupation` et `stock-bas` n'ont pas de notion
  « ses opérations » (ce sont des compteurs globaux à l'hôtel) : ils suivent
  simplement les permissions déjà établies pour Chambres et Stock.
- **`PublicModule`** n'a **aucun** guard (`SupabaseAuthGuard`/`RolesGuard`) —
  le rôle CLIENT de la section 9.1 n'a explicitement pas de compte. Testé
  explicitement (`roles.e2e-spec.ts`) que ces routes répondent 200 sans le
  moindre jeton, pour figer cet invariant avant qu'une Phase future n'ajoute
  par erreur un guard global qui casserait le site public.
  `POST /public/reservations` crée toujours une `Reservation` `EN_ATTENTE`
  (jamais confirmée directement), avec `createdBy = "SITE_PUBLIC"` — une
  valeur sentinelle plutôt qu'un `Utilisateur.id`, possible uniquement parce
  que `Reservation.createdBy` est un simple champ `String` en base, pas une
  relation Prisma vers `Utilisateur` (donc pas de contrainte de clé
  étrangère à satisfaire). Une demande `EN_ATTENTE` n'entre pas dans
  `STATUTS_OCCUPANTS` : elle n'empêche jamais un autre client (ou la
  réception) de réserver la même période — vérifié contre la vraie base.
  Le client est retrouvé par téléphone s'il existe déjà, sinon créé.

Vérifié de bout en bout contre la vraie base : `recette-du-jour` isole
correctement deux réceptionnistes différents l'un de l'autre (0 $ pour celui
qui n'a rien facturé, le montant exact pour celui qui a facturé), le patron
voit le total complet ; `/public/*` répond sans authentification ; une
demande publique n'empêche pas la disponibilité de la chambre pour les mêmes
dates.

## SyncModule (section 10.3) — dernier module backend de la section 8

`POST /sync/push` et `GET /sync/pull` complètent la surface API listée
section 8. Construit maintenant plutôt qu'en attendant une vraie app
Electron/mobile hors ligne (aucune n'existe encore) parce que le contrat
push/pull et la résolution de conflit (section 10.4) sont entièrement
testables à la main (curl simulant un appareil), exactement comme le reste
du backend — pas besoin d'UI pour vérifier que ça fonctionne.

**Chaque type d'entité délègue à son service métier existant**
(`ChambresService`, `ReservationsService`, `ProduitsService`, `StockService`,
`CafeteriaService`) plutôt qu'un passthrough Prisma générique. Décision
importante : un `create()` générique aurait cassé des invariants déjà en
place — par exemple, `LigneCommande` doit décrémenter le stock
atomiquement (voir Phase 3), ce qui n'existe que dans
`CafeteriaService.ajouterLigne()`. Déléguer aux services existants garantit
aussi que la sync ne peut jamais faire plus que ce que l'endpoint direct
équivalent permettrait déjà (ex. la restriction RECEPTIONNISTE sur les
champs de `Chambre` s'applique automatiquement, sans dupliquer la règle).

**Entités exclues de `POST /sync/push`** (mais lisibles via `GET /sync/pull`,
qui n'a pas ce problème puisqu'il ne fait que lire) : `Facture` et
`VenteCafeteria`. Leur création implique un calcul serveur trop spécifique
(numéro de reçu séquentiel, montants multi-devises, intégration cafétaria →
facture chambre) pour un passthrough générique, et le préfixe `TEMP-` de
réimpression décrit section 11.3 (pour un reçu imprimé hors ligne avant
d'avoir un numéro définitif) n'a pas encore de véritable consommateur —
aucune app hors ligne n'existe pour révéler la forme exacte dont elle aurait
besoin. À traiter quand Phase 2b/3b (Electron) ou une app mobile existera
réellement.

**Limite connue** : la réponse d'un `CREATE` ne renvoie que `{localId,
remoteId, syncVersion}` de l'entité elle-même — pas ses sous-ressources
créées en cascade. `CompteCafeteria` crée automatiquement un premier
`SousCompte` "Personne 1" (voir Phase 3), mais son `remoteId` n'apparaît pas
dans la réponse de sync : un appareil voulant y ajouter une ligne juste après
doit d'abord faire un `GET /cafeteria/comptes/:id` (ou attendre le prochain
`pull`). Repéré en testant justement ce scénario contre la vraie base.

**Bug corrigé avant de construire ce module** : `syncVersion` n'était
jamais incrémenté après sa valeur initiale (`@default(1)`) sur AUCUNE des
Phases 1-3 — la détection de conflit aurait donc été un mécanisme
complètement inerte. Voir le commit dédié « Fix syncVersion... » : chaque
site d'écriture across `ChambresService`, `ReservationsService`,
`ProduitsService`, `StockService`, `FacturesService`, `CafeteriaService`
incrémente désormais `syncVersion` à chaque modification.

Vérifié de bout en bout contre la vraie base, en simulant deux appareils qui
divergent hors ligne : appareil A pousse `statut=OCCUPEE` avec
`baseSyncVersion=1` → accepté, `syncVersion` passe à 2 ; appareil B pousse
`statut=RESERVEE` avec le même `baseSyncVersion=1` (périmé) → refusé
proprement en `CONFLICT` avec l'état serveur actuel, rien n'est écrasé ; B
relance avec `baseSyncVersion=2` → accepté. `LigneCommande` poussée via sync
décrémente bien le stock automatiquement (mêmes vérifications que Phase 3,
mais via le chemin générique de sync cette fois). Un rôle non autorisé
(CAFETARIA créant un `Produit`) reçoit une erreur d'opération propre, jamais
un crash du lot entier.

## Phase 2b, tranche 1 — Electron : connexion + écran Chambres

Première UI réelle. Plutôt que d'attaquer toute la surface Electron
(réservations, facturation, cafétaria, impression) d'un coup, une seule
tranche verticale complète et vérifiée : connexion Supabase réelle → écran
Chambres alimenté par la vraie API. Le reste suivra écran par écran.

**Choix techniques** (non imposés par le prompt au-delà de « Electron +
React ») : `electron-vite` (un seul outil pour main/preload/renderer), pas de
routeur ni de gestionnaire d'état pour trois écrans (état React local),
configuration persistée dans `configuration.json` du dossier `userData` via
IPC (section 6 : URL de l'API modifiable depuis un écran Paramètres).
La clé *anon* Supabase est pré-remplie dans l'app : elle est publique par
conception (protégée par la RLS), contrairement à la clé `service_role`,
qui n'apparaît jamais côté client.

**Vérification sans outil visuel.** Aucun outil de capture d'écran n'est
disponible dans cet environnement. La vérification passe donc par
Playwright en mode Electron : il lance la vraie app buildée et interroge le
DOM réellement rendu (texte, attributs, comportement), contre la vraie API,
la vraie base et un vrai compte Supabase Auth créé puis supprimé pour le
test. Ce qui est vérifié : connexion réelle, message d'erreur en français,
chambres réelles avec prix formatés (`45.00 $`, `20 000 FC`) et statuts
(`Libre`, `Occupée`), bascule du mode sombre, session conservée au
redémarrage. Ce qui ne l'est **pas** : l'apparence exacte (couleurs,
espacements, polices) par rapport à la charte — contrôle humain requis.

**Trois problèmes réels révélés par cette première UI** (tous corrigés) :
1. **Vérification des jetons** : Supabase signe en ES256 via JWKS, pas avec
   le secret HS256 supposé en Phase 1 — voir la section « Authentification
   Supabase » ci-dessus. Aucun utilisateur réel n'aurait pu se connecter.
2. **Paquets partagés non bundlables par Vite** (interop CJS→ESM) :
   `packages/ui` et `packages/api-client` passent en ESM, `packages/types`
   en double build CJS + ESM (consommé à la fois par l'API Node et par le
   renderer).
3. **Messages d'erreur en anglais** : Supabase renvoie "Invalid login
   credentials" — désormais traduit par code d'erreur (`invalid_credentials`,
   `user_banned`, etc.). Une coupure internet donne aussi un message français
   explicite au lieu de "Failed to fetch".

Ajout côté API : `GET /auth/me` (nom et rôle de l'utilisateur connecté),
nécessaire à tout client pour savoir quoi afficher après connexion.

**Polices embarquées, pas Google Fonts (écart assumé avec la section 12.3).**
La section 12.3 dit de charger les polices via Google Fonts, ce qui échoue
dès que l'internet de l'hôtel coupe — or l'app desktop doit fonctionner hors
ligne (section 2, non négociable). L'app Electron embarque donc Fraunces,
Public Sans et IBM Plex Mono via `@fontsource` (mêmes familles, mêmes
graisses). Découvert grâce à la première capture d'écran fournie par
l'utilisateur : aucune police n'était chargée du tout, le titre s'affichait
en Times New Roman. Un test E2E vérifie maintenant les polices réellement
chargées dans le DOM (il échouait sur l'ancien build, il passe sur le
nouveau).

**Pas encore fait** : aucun écran de gestion des comptes n'existe. Aucun
utilisateur ne peut se connecter tant qu'un compte Supabase Auth ET une
ligne `Utilisateur` liée n'ont pas été créés (voir le README racine).

## Phase 2b, tranche 2 — Coquille de l'app desktop

La première tranche n'avait ni navigation ni barre d'état : jugé inutilisable
par le client. Choix validés avec lui :

- **Barre latérale** regroupée par métier (Réception, Cafétaria,
  Administration), filtrée par rôle selon la matrice 9.3
  (`src/renderer/src/navigation.ts`). Le PATRON voit tout.
- **Écrans pas encore construits** : affichés grisés avec « Bientôt » ; un
  clic ouvre une page qui le dit clairement, jamais une page vide.
- **Barre du haut** : date, état RÉEL du serveur (ping `/health` toutes les
  20 s, et on vérifie que c'est bien `hotel-chicago-api` qui répond),
  mode sombre, utilisateur + rôle, déconnexion. On n'affiche volontairement
  pas « Synchronisé » : le moteur hors ligne (section 10) n'existe pas
  encore côté app.
- **Fenêtre étroite (< 900 px)** : la barre latérale disparaît au profit
  d'une barre du bas (4 entrées + « Plus » qui ouvre le menu complet).
  C'est aussi le modèle de navigation prévu pour l'app mobile.
- **Pas de maquette fournie** : mise en page conçue depuis la charte
  (section 12). L'entrée active utilise surface-300 + rust, pas l'accent,
  qui reste réservé au bouton d'action principal.
- **Logo** uniquement sur l'écran de connexion (section 12.6), dans un cadre
  blanc parce que le fichier fourni a un fond blanc.
- Une réponse 404 sur `/auth/me` signifie que l'adresse répond mais que ce
  n'est pas notre serveur (cas réel : un autre projet sur le port 3000) : le
  message le dit en français au lieu de « Cannot GET /auth/me ».

## Phase 2b, tranche 3 — Refonte complète UI/UX (navy/bleu, 24/09/2026)

Le client a rejeté la charte terracotta/beige initiale (section 12 du prompt
d'origine) après avoir vu l'app tourner, et fourni un second cahier des
charges détaillé (42 sections) avec une maquette de référence : palette
bleu nuit (#0F2742) + bleu (#1769E0), police Inter, sidebar/topbar/dashboard
denses à l'américaine. Ce cahier des charges **remplace** la section 12 pour
tout ce qui touche à la couleur et à la typographie ; le reste du prompt
d'origine (règles métier, multi-devises, RBAC...) est inchangé.

**Jetons** (`packages/ui/src/tokens.css`, `typography.css`) : toute la
palette terracotta a été supprimée et remplacée (navy/bleu/succès/alerte/
info/violet + mode sombre #0B1220/#162337 par section 32 du cahier). Une
seule police, Inter, remplace Fraunces/Public Sans/IBM Plex Mono partout
(desktop : `@fontsource/inter`, plus de police d'affichage séparée). Comme
tous les composants du design system lisent des variables CSS et jamais une
couleur en dur, le changement de palette a suffi à retoucher Button,
StatusBadge, RoomCard, DashboardStat sans changer leur API (sauf l'ajout
d'un tone `"purple"` pour le statut Nettoyage, et d'une prop `icone` sur
DashboardStat pour les pastilles-icônes des cartes KPI).

**Nouveau composant partagé** : `Donut` (`packages/ui/src/Donut.tsx`), un
anneau SVG pur (pas de dépendance de graphique) pour la répartition des
chambres — générique, ne connaît pas `StatutChambre`, l'appelant lui passe
des segments `{valeur, couleur}`.

**Coquille** (`layout/Coquille.tsx`) refaite : sidebar bleu nuit fixe (ne
change pas avec le thème clair/sombre, comme dans la maquette), topbar
blanche avec recherche, notifications (panneau honnête « Aucune notification
pour le moment » — pas de faux badge, cohérent avec le choix déjà pris pour
« Serveur connecté »), bascule de thème, menu utilisateur déroulant (Paramètres
+ Déconnexion — pas de « Mon profil »/« Changer mot de passe » puisque ces
écrans n'existent pas, pour ne pas proposer un menu qui mène nulle part).

**Recherche globale** : la barre de recherche de la topbar applique son terme
à l'écran Chambres (numéro/type) et y navigue — fonctionnelle, pas
décorative.

**Activité récente** (nouveau bloc du tableau de bord) : consomme le vrai
`GET /dashboard/ventes-recentes` (déjà présent côté API), fusionne factures
et ventes cafétaria triées par date. Pas de données inventées : si l'API
renvoie deux listes vides, l'état vide honnête « Aucune activité aujourd'hui »
s'affiche plutôt qu'un faux exemple.

**Hero du tableau de bord** : dégradé CSS bleu nuit plutôt qu'une photo de
chambre d'hôtel — aucun asset photo réel n'a été fourni, et utiliser une
image de stock non vérifiée aurait été une donnée fabriquée au même titre
qu'une fausse activité récente.

**Page Chambres** : vraie table desktop (N°, Type, Statut, Prix/nuit,
Client, Actions) + cartes sur fenêtre étroite (< 860px, jamais les deux à la
fois dans le DOM — sinon les textes seraient dupliqués et casseraient les
sélecteurs de test). Colonne Client affichée à `—` : sans écran Réservations,
il n'existe aucun moyen honnête de savoir qui occupe une chambre. Le bouton
« ... » de chaque ligne ouvre un vrai menu de changement de statut (utilise
`ClientApi.modifierStatutChambre`, déjà existant) — plus utile qu'un menu
d'actions qui ne mènerait nulle part. Le bouton « + Nouvelle réservation »
navigue vers l'écran Réservations (« Bientôt »), honnête car rien n'est créé.

## Photo du hero (placeholder, 25/09/2026)

Le hero du tableau de bord utilisait un dégradé uni (aucune photo réelle
fournie au moment de la refonte navy/bleu). Le client a explicitement demandé
une photo temporaire piochée sur internet, à remplacer plus tard par une
vraie photo de l'hôtel. Choix faits pour rester cohérent avec les règles déjà
en place :
- Image téléchargée UNE FOIS et commitée en asset local
  (`apps/desktop/src/renderer/src/assets/hero-chambre.jpg`) plutôt que liée en
  URL distante — l'app doit fonctionner hors ligne (section 2), comme pour les
  polices bundlées.
- Photo Unsplash (licence Unsplash : libre d'usage, y compris commercial,
  sans attribution obligatoire).
- Remplacement futur : écraser ce même fichier avec la vraie photo, aucun
  autre changement de code nécessaire.
- Superposition sombre appliquée en CSS (dégradé semi-transparent) pour
  garder le texte blanc lisible par-dessus, avec repli sur l'ancien bleu nuit
  uni si l'image ne charge pas.

## Incident du 25/09/2026 — suppression accidentelle de tous les comptes Supabase Auth

En nettoyant un compte de test, un script a interrogé
`GET /auth/v1/admin/users?email=...` en supposant que Supabase filtrerait par
email — il ne l'a pas fait, l'endpoint a renvoyé tous les comptes du projet,
et le script les a tous supprimés, y compris les deux comptes réels
(`hotelchicago@gmail.com` / ELIE RWITANI, `patron@hotelchicago.com`). Les
lignes `Utilisateur` en base n'ont pas été touchées (table séparée), seule
l'authentification a été perdue.

**Leçon retenue** : plus jamais de script qui *liste puis filtre côté
client* sur l'API admin Supabase Auth — uniquement des opérations ciblées
par id exact (voir `packages/database/scripts/creer-utilisateur.js` et
`reconnecter-utilisateur.js`, qui ne manipulent jamais qu'un id connu
d'avance). Un script de "nettoyage par motif" a été écrit puis supprimé
immédiatement après l'incident.

**Récupération** : nouveau script `reconnecter-utilisateur.js` (recrée un
compte Supabase Auth et le relie à une ligne `Utilisateur` **existante**,
sans en créer une nouvelle — contrairement à `creer-utilisateur.js`). Le
patron l'a lancé lui-même avec son propre mot de passe (jamais transmis dans
la conversation). Les lignes `Utilisateur` orphelines restantes (comptes de
test, un compte placeholder `Your Full Name`) ont été supprimées par id
explicite après confirmation.

## Panne du pooler Supabase en mode session (port 5432), 25/09/2026

Sans rapport avec l'incident ci-dessus : le pooler Supavisor en mode session
(port `5432`, choisi en section "Connexion Postgres" ci-dessus) a cessé de
répondre au protocole Postgres (la connexion TCP s'établit mais rien ne
répond ensuite), alors que le pooler en mode transaction (port `6543`)
fonctionne normalement. `DATABASE_URL` a été basculée temporairement sur le
port `6543` avec `?pgbouncer=true` (recommandation Prisma pour ce mode),
dans `apps/api/.env` et `packages/database/.env` — anciennes valeurs
sauvegardées à côté (`.env.bak-avant-6543`). **À revenir en arrière** dès que
le pooler en mode session est de nouveau opérationnel (revérifier avant, ne
pas juste supposer que c'est réparé) : le mode transaction reste moins fiable
pour `prisma migrate` (verrous consultatifs, requêtes préparées).

## Phase 5 — Application mobile (React Native / Expo), 25/09/2026

Le patron a choisi de démarrer la Phase 5 complète (hors-ligne SQLite,
synchronisation, impression thermique Bluetooth) plutôt qu'une version
allégée, en connaissance du temps que ça demande. Première tranche livrée
cette session : sélection de profil, connexion, tableau de bord, Chambres —
voir `apps/mobile/README.md` pour le détail et ce qui reste à faire.

Décisions structurantes :
- **Workflow bare/prebuild dès le départ**, pas Expo Go : le Bluetooth
  (section 11) en a besoin, et migrer un projet managé vers bare plus tard
  aurait été plus coûteux que de partir bare directement. Le SDK Android
  complet étant déjà installé sur la machine (build-tools, NDK, licences
  acceptées), le premier build natif ne demandait pas d'installation lourde
  supplémentaire — seul Gradle lui-même (téléchargé une fois par le wrapper,
  avec la connexion de l'ordinateur, jamais le forfait du téléphone).
- **`.npmrc` racine : `node-linker=hoisted`** — recommandation officielle
  d'Expo pour les monorepos pnpm (Metro ne résout pas fiablement les
  symlinks stricts par défaut de pnpm, notamment pour l'autolinking natif).
  Changement rétrocompatible : toute la suite de tests existante (api, ui,
  api-client, build desktop) a été revérifiée après coup, tout passe encore.
- **`packages/ui` non utilisé côté mobile** : ce paquet charge des fichiers
  `.css` en effet de bord (imports comme `import "./button.css"`), que
  Metro ne sait pas interpréter. Seuls `@hotel-chicago/types` et
  `@hotel-chicago/api-client` (logique pure, sans CSS ni DOM) sont
  partagés ; `formatMontant` a été dupliqué à l'identique
  (`apps/mobile/src/formatMontant.ts`) plutôt que d'essayer de faire
  cohabiter deux bundlers sur un même paquet. Les couleurs/espacements de la
  charte sont portés en constantes RN (`apps/mobile/src/tokens.ts`), à tenir
  synchronisées à la main avec `packages/ui/src/tokens.css` si la charte
  change.
- **Sélection de profil** implémentée comme une liste de comptes déjà connus
  sur l'appareil (nom/rôle/email en `AsyncStorage`, jeton de rafraîchissement
  chiffré en `expo-secure-store`, jamais le mot de passe) plutôt qu'un
  système de PIN — aucune infrastructure de PIN n'existe côté backend, et en
  inventer une n'était pas demandé. "Changer de profil" garde le compte
  enregistré ; l'appui long sur un profil le retire de l'appareil.
- **Prévisualisation en développement via `adb reverse`** (câble USB), pas
  Wi-Fi ni IP réseau à exposer : `adb reverse tcp:8081 tcp:8081` (Metro) et
  `tcp:3001 tcp:3001` (API) suffisent, cohérent avec la préoccupation du
  patron sur la consommation de son forfait internet.

## Phase 5 (suite) — Paramètres/Caisse/Menu/Stock, puis moteur de synchronisation, 25/09/2026

Deux passes supplémentaires sur le mobile après la tranche initiale.

**Paramètres + Cafétaria (Caisse, Comptes ouverts, Menu, Stock)** : les cinq
entrées de l'onglet "Plus" encore en "Bientôt" sont devenues réelles.
Paramètres reprend juste l'URL de l'API + un test de connexion (pas de bascule
de thème ni de bloc Administration, déjà ailleurs sur mobile). Caisse/Comptes
ouverts/Menu/Stock consomment les routes `CafeteriaController`/
`ProduitsController`/`StockController`, déjà construites et testées côté API
mais jamais câblées côté client (`packages/api-client` n'avait aucune méthode
pour elles). Portée volontairement réduite et affichée dans l'UI, pas cachée :
encaissement en mode `GROUPE` uniquement (`PAR_SOUS_COMPTE`/`PARTAGE_EGAL`
existent côté API mais demandent une UI de répartition non triviale, marqués
"Bientôt" dans le formulaire), paiement `CASH`/`MOBILE_MONEY` seulement
(`FACTURE_CHAMBRE` demande un sélecteur de réservation, pas encore de méthode
`api-client` pour lister les réservations). Vérifié en conditions réelles :
créer un produit, enregistrer un mouvement de stock, ouvrir un compte,
ajouter une ligne, encaisser — le compte se ferme bien et disparaît de
"Comptes ouverts".

Bug trouvé en testant les formulaires (Menu notamment, 4 champs) sur
l'appareil réel : la feuille modale partagée (`FeuilleModale.tsx`) ne prenait
pas le clavier en compte, rendant les derniers champs inatteignables une fois
le clavier ouvert. Corrigé en enveloppant son contenu dans un `ScrollView`
par défaut (avec un `avecDefilement={false}` pour les cas qui apportent déjà
leur propre liste virtualisée, comme le sélecteur de produit — imbriquer une
`FlatList` dans un `ScrollView` casse le défilement).

**Moteur de synchronisation hors ligne** (section 10) : construit comme
infrastructure réutilisable dans `packages/sync-engine` (jusque-là une
coquille vide), capable de gérer n'importe laquelle des 7 entités poussables,
mais un seul écran câblé dans cette passe — **Chambres**, la plus simple
(entité plate, sans relations imbriquées, contrairement à `CompteCafeteria` →
`SousCompte` → `LigneCommande` que `GET /sync/pull` ne renvoie que sous forme
de lignes plates par table, sans `include`). Mobile n'avait d'ailleurs aucune
interaction pour changer le statut d'une chambre (contrairement au desktop) —
ajoutée ici (appui sur une chambre → feuille modale des 4 statuts) pour avoir
un vrai chemin d'écriture à faire passer par le moteur.

Architecture : `StockageLocal` (interface agnostique du stockage réel) +
`MoteurSync` (ping de connectivité ~20s, backoff exponentiel 5s/15s/30s/1min/
2min sur échec réseau réinitialisé à la reconnexion, verrou empêchant deux
cycles de tourner en même temps, anti-écrasement — un pull ignore toute ligne
dont l'id a une entrée en attente dans la file, réconciliée par la réponse du
push plutôt que par un pull concurrent qui renverrait l'ancien état) dans
`packages/sync-engine`, testé unitairement sans appareil (logique pure).
Côté mobile : SQLite (`expo-sqlite`, installé depuis le début mais jamais
utilisé jusqu'ici) pour le miroir `chambres` + `sync_queue` + `sync_conflicts`
+ `sync_meta`. Un point coloré discret dans `EnteteMobile.tsx` (vert/orange
avec compteur/rouge/gris) donne l'état en un coup d'œil sur chaque écran ;
l'écran détaillé ("Synchronisation", toujours accessible depuis "Plus") liste
les conflits avec les deux valeurs (jamais silencieusement perdu, section
10.4) et un bouton "Garder la version du serveur" qui écrit vraiment
`donneesServeur` dans le miroir local — sans ça, la modification suivante
réutiliserait un `syncVersion` déjà périmé et re-conflicterait aussitôt.

Vérifié en conditions réelles sur l'appareil : changement de statut hors
ligne mis en file puis synchronisé au retour de connexion, et un vrai
conflit provoqué délibérément (modification directe en base pendant qu'une
feuille de choix de statut était ouverte côté mobile avec un `syncVersion`
déjà périmé) — capturé proprement, affiché avec les deux valeurs, résolu sans
perte de données.

Effet de bord technique : `packages/sync-engine` importe
`@hotel-chicago/api-client`, et ses tests tournent sous Jest/ts-jest
(CommonJS). Le build de `api-client` n'était qu'en ESM (`"type": "module"` à
la racine) — Node refusait de le `require()`, echouant sur `export` (syntaxe
non reconnue en CommonJS). Corrigé en donnant à `api-client` le même double
build CJS/ESM que `packages/types` (`dist/cjs` + `dist/esm`, `exports` map) ;
les deux paquets ont maintenant le même patron, à réutiliser pour tout futur
paquet partagé consommé à la fois par un bundler (Vite/Metro) et par Jest.

**Incident sans rapport, trouvé en préparant le commit** : `apps/api/.env`
avait `PORT=3000` (au lieu de `3001`) — collision avec le port du projet
LinkPay du patron, et contradiction avec ce même fichier DECISIONS.md. Des
fichiers mobile (`configuration.ts`, `README.md`) avaient été modifiés pour
suivre ce mauvais port plutôt que de corriger `.env`. Origine exacte inconnue
(pas dans cette session). `apps/api/.env` remis à `3001`, les fichiers mobile
restaurés à leur version commitée.

## Phase 6 — Impression thermique ESC/POS + facturation de séjour (mobile + desktop), 26/09/2026

Section 11 demandait l'impression ESC/POS (reçus chambre + cafétaria) sur les
deux apps. Deux prérequis manquaient et ont été construits dans cette même
passe (décision du patron, cadrage élargi deux fois par rapport à la
proposition initiale) :

- **Aucun flux de facturation/check-out n'existait** — ni mobile ni desktop.
  Ajouté : `packages/types` (`Reservation`, `Client`, `Facture`),
  `api-client` (`listerReservations`, `obtenirReservation`, `checkIn`,
  `checkOut`, `creerFacture`, `obtenirFacture`, `listerVentesCafeteria` — ce
  dernier existait déjà côté API, jamais exposé côté client). Mobile :
  onglet "Réserv." (`disponible: false` → `true`) devient la liste des
  séjours `EN_COURS` sans facture, tap → `EcranFacturation.tsx` (récap,
  consommations cafétaria liées, mode de paiement, "Facturer et check-out").
  Desktop : `reservations` reste "Bientôt" dans la barre latérale (pas de
  liste séparée) — `EcranFacturation.tsx` desktop combine liste et détail en
  un seul écran avec un état local, pour ne pas dupliquer un deuxième chemin
  de navigation vers la même chose.
- **La bibliothèque nommée dans le spec (`react-native-esc-pos-printer`) est
  en fait liée au SDK propriétaire Epson** — vérifié avant d'écrire le
  moindre code. Le patron utilisera une imprimante Bluetooth générique.

Architecture retenue : un modèle de reçu partagé (`LigneRecu`, union
discriminée titre/sous-titre/séparateur/champ/montant) dans un nouveau
paquet `packages/receipts` (même double build CJS/ESM que `api-client`),
construit une seule fois par `construireRecuFacture`/`construireRecuVente`
(gabarits section 11.2/11.3 : jamais de ligne de total à 0, devises jamais
fusionnées) et traduit différemment par plateforme :
- **Mobile** : `react-native-bluetooth-classic` (transport SPP brut,
  appareils **déjà appairés** au niveau système uniquement — aucun
  appairage depuis l'app) + un générateur ESC/POS écrit à la main
  (`genererCommandesEscPos`, table CP850 pour les accents français), pour ne
  pas dépendre d'une bibliothèque tout-en-un tierce pour le formatage. Le
  risque a été vérifié tôt (`expo prebuild` + `./gradlew assembleDebug` en
  tout premier, avant d'investir dans le reste) : build natif réussi.
  Réglage dans "Plus" > "Imprimante" (liste des appareils appairés,
  sélection, ticket de test), bouton "Imprimer le reçu" dans
  `EcranFacturation.tsx` et dans `EcranCompteCafeteria.tsx` (après
  encaissement).
- **Desktop** : `node-thermal-printer` dans le process principal Electron
  (IPC `impression:imprimer`/`impression:test`), consomme `LigneRecu[]`
  directement via sa propre API (`leftRight`, `drawLine`, `bold`...) — pas
  besoin du générateur ESC/POS manuel ici. **Décision de cadrage** : pas de
  liste des imprimantes système Windows — `node-thermal-printer` ne peut
  leur envoyer des octets bruts que via le paquet natif `printer` (bindings
  natifs à compiler), un risque de build supplémentaire volontairement évité
  après en avoir déjà rencontré deux sur ce projet (SDK Epson, build natif
  Bluetooth). Le patron renseigne donc directement une connexion réseau
  (`tcp://ip:9100`, quasi standard sur les imprimantes ESC/POS bon marché)
  ou un chemin de périphérique (`\\.\COM5`, `/dev/usb/lp0`) depuis
  Paramètres > Imprimante. Impression desktop limitée au reçu chambre : la
  Cafétaria desktop (Caisse/Menu/Stock) reste "Bientôt", donc rien à quoi
  accrocher un bouton d'impression cafétaria côté desktop.

Numérotation des reçus : déjà générée côté serveur à la création
(`REC-`/`CAF-YYYYMMDD-####`, code existant) — les deux flux qui impriment
appellent l'API en direct et ne passent jamais par la file hors ligne
(`Facture`/`VenteCafeteria` exclus de `POST /sync/push`), donc pas de
préfixe `TEMP-` à gérer.

Hors scope, documenté : impression cafétaria desktop (UI Caisse desktop
inexistante), répartition `PAR_SOUS_COMPTE`/`PARTAGE_EGAL` à l'impression,
paiement croisé/monnaie rendue sur la facturation mobile/desktop (même
simplification que l'encaissement Caisse mobile).

Vérifié dans cette passe : `pnpm --filter receipts test` (8 tests, logique
pure), `tsc --noEmit` propre dans `packages/types`, `api-client`, `receipts`,
`apps/mobile`, `apps/desktop` (main + renderer), `pnpm run build` propre sur
`apps/desktop`, build Android natif réussi après ajout de
`react-native-bluetooth-classic`. **Non vérifié** : impression réelle sur une
imprimante Bluetooth/réseau physique — nécessite le matériel du patron, à
faire à la prochaine session avec l'appareil en main.

## Phase 6 (suite) — Cafétaria hors ligne + enquête de lenteur Prisma/Supabase, 26/09/2026

**Symptôme** : le patron a signalé le service Cafétaria mobile comme trop
lent (chaque "ajouter une ligne" attendait un aller-retour réseau complet).
Mesuré en direct : `prisma.produit.findFirst()` répété prend 1,2 à 4s à
chaque appel, sans amélioration entre le 1er et le 4ème appel immédiat.

**Cafétaria rendue hors ligne** (même moteur que Chambres, Phase 5) :
`CompteCafeteria`/`SousCompte`/`LigneCommande` étaient déjà dans
`ENTITES_PUSH`/`ENTITES_PULL` et routés côté serveur — zéro changement
backend nécessaire. Côté mobile : nouvelles tables miroir
(`comptes_cafeteria`/`sous_comptes`/`lignes_commande`/`produits` dans
`sqlite.ts`), nouveau `cafeteriaMirroir.ts` (patron `chambresMirroir.ts`),
`EcranCaisse`/`EcranComptesOuverts`/`EcranCompteCafeteria` retrofités pour
lire/écrire le miroir au lieu de l'API directe. Différence avec Chambres :
Cafétaria fait des `CREATE` (pas seulement des `UPDATE`), donc pas d'id
serveur connu à l'écriture optimiste — les tables miroir Cafétaria gardent
un **id local stable, jamais renommé**, avec une colonne `remoteId` séparée
remplie une fois la création confirmée (`apps/mobile/src/stockage/cafeteriaMirroir.ts`),
pour éviter une re-clé en cascade sur les enfants. Pour la même raison, "ajouter une personne"/"ajouter
une ligne" sont désactivés tant que leur parent (compte/sous-compte) n'est
pas confirmé synchronisé (`MoteurSync.idsEnAttente`, déjà exposé par
l'interface). **L'encaissement reste volontairement en ligne** — impossible
à précalculer hors ligne (numérotation séquentielle des reçus, fermeture
atomique du compte) — et bloque désormais tant que des lignes du compte sont
encore en file, sans quoi le total facturé serait incomplet.

**Bug de moteur trouvé en testant** : `MoteurSync.tirer()` calculait le
curseur "depuis" partagé comme le MINIMUM des curseurs déjà connus, en
ignorant les entités jamais tirées (`null`) — si une entité neuve (Produit)
était ajoutée à `entitesPull` alors qu'une autre (Chambre) avait déjà un
curseur avancé, la neuve héritait silencieusement de ce curseur avancé et ne
recevait jamais son historique complet ("aucun produit" en test réel). Corrigé :
une entité jamais tirée ramène tout le lot à l'epoch. Un appareil déjà touché
par le bug avant le correctif garde un curseur corrompu en local (le
correctif ne le répare pas rétroactivement) — remède appliqué : effacer les
données de l'app (`pm clear`) pour repartir propre.

**Enquête de lenteur Prisma/Supabase (le patron a eu raison de douter que
"c'est juste la distance")** : mesures en direct qui ont isolé la vraie
cause, à ne pas oublier si le sujet revient :
- Latence réseau générale (Google, API REST Supabase, pooler Supabase) :
  ~200-400ms — normale, pas le problème.
- Connexion Postgres brute (`pg`), une fois établie, enchaîne les requêtes à
  ~220ms chacune — cohérent avec cette latence.
- La même requête via Prisma prend 1,2 à 4s **à chaque fois**, y compris
  immédiatement répétée : Prisma ne réutilise pas sa connexion.
- Retirer `pgbouncer=true` de `DATABASE_URL` fait retomber Prisma à ~220ms —
  mais un test de charge (requêtes différentes enchaînées) échoue aussitôt
  avec des erreurs de requêtes préparées : `pgbouncer=true` reste
  obligatoire tant que le pooler Supabase est coincé en mode "transaction"
  (panne du mode "session" du 25/09/2026, toujours pas réparée).
- **Essayé et abandonné** : passer `packages/database` sur le "driver
  adapter" `@prisma/adapter-pg` (connexion portée par un `pg.Pool` classique
  au lieu du moteur natif de Prisma). Corrige bien le risque de requêtes
  préparées, mais **aucun gain de vitesse** : à Prisma 5.22, le moteur
  enveloppe TOUTE requête (même un simple `findFirst`) dans un contexte de
  transaction côté adaptateur (`transactionContext()` → `pool.connect()`
  dédié → commit/release) — ce qui déclenche exactement le même cycle de
  réassignation de connexion que le pooler impose déjà à une vraie
  transaction. Un `pg.Pool.query()` brut, hors du chemin d'exécution de
  Prisma, reste rapide (~220-270ms, une seule connexion physique réutilisée,
  vérifié). Changement annulé proprement (schema.prisma, package.json,
  `packages/database/src/index.ts` restaurés).
- **Conclusion** : le vrai correctif est soit (a) la réparation du pooler
  Supabase en mode "session" par Supabase (hors de notre contrôle), soit
  (b) une montée de version majeure de Prisma (5→6/7/8 — les driver adapters
  sont sortis de préversion et ce chemin d'exécution a été retravaillé) —
  un chantier à part entière, pas fait dans cette passe. En attendant,
  l'approche retenue est de rendre hors ligne les parcours à haute fréquence
  (Cafétaria fait dans cette passe, Réception à suivre) plutôt que de
  chercher à accélérer chaque aller-retour individuel.

Vérifié dans cette passe : `pnpm --filter sync-engine test` (9 tests, dont le
nouveau test de curseur epoch + `annulerOperation`), `pnpm --filter api test`
(cafétaria/stock, 29 tests), `npx tsc --noEmit` propre dans `apps/mobile`,
build Android natif réussi après ajout d'`expo-crypto`. **Non vérifié en
usage prolongé réel** : le comportement de "Encaisser" bloqué en attente de
synchronisation, et le retrait d'une action définitivement échouée depuis
"Synchronisation" — testés une fois chacun en conditions réelles, à
surveiller.

## Migration vers un nouveau projet Supabase (`zjplcqocmkctbfxnxheq`), 27/09/2026

Suite de l'enquête de lenteur Prisma/Supabase (Phase 6 ci-dessus) : le patron
a fait une découverte importante en comparant avec un autre de ses projets
(**LinkPay**, même région `eu-west-1`, fonctionne normalement) — ce n'était
donc pas une panne régionale. Décision : créer un nouveau projet Supabase
plutôt que d'attendre une réponse du support sur l'ancien
(`krvhnsyvlkgvcxncvwkx`, gardé tel quel, non supprimé, en secours).

**Découverte en testant** : le premier nouveau projet créé (`eu-west-1`,
comme l'ancien) avait **exactement le même problème** — port 5432 (mode
session) muet, port 6543 (transaction) fonctionnel. Un deuxième projet créé
dans une **région différente** (`eu-central-1`) a **le même symptôme**.
Conclusion réelle, plus large que prévu : ce n'est ni le projet ni la région
qui posent problème — c'est une limitation/panne du mode "session" de
Supavisor qui semble toucher large (peut-être toute l'infrastructure
Supabase actuelle, pas juste `eu-west-1`). Le message déjà rédigé pour le
support Supabase reste valable et pertinent, à envoyer indépendamment de
cette migration.

**Le mode "direct connection"** (`db.<ref>.supabase.co:5432`, sans passer
par le pooler partagé) a aussi été essayé : ne fonctionne pas ici — il est
IPv6 uniquement par défaut (confirmé : la résolution DNS renvoie bien une
adresse IPv6, mais ce poste n'a **aucune route réseau IPv6** vers
l'extérieur, `ENETUNREACH`). Nécessiterait soit l'option payante IPv4 chez
Supabase, soit une machine avec IPv6 opérationnel.

**Décision finale** : garder le nouveau projet (`eu-central-1`,
`zjplcqocmkctbfxnxheq`) tel quel, en mode transaction (`pgbouncer=true`,
port 6543) — même limite de vitesse que l'ancien (voir Phase 6 ci-dessus,
non résolue par ce changement de projet), mais base de données propre sans
les données de test du 26/09, et si Supabase répare un jour le mode session
n'importe où dans son infrastructure, on en profite automatiquement sans
reconfigurer.

**Complication rencontrée** : `prisma migrate deploy` (le moteur de
migration Prisma, un binaire Rust séparé du client JS) échoue contre ce
pooler en mode transaction avec `P1017: Server has closed the connection` —
les migrations ont besoin d'une session stable que ce mode ne garantit pas,
contrairement aux requêtes applicatives normales. Contourné en appliquant
les 3 fichiers `migration.sql` manuellement via une connexion `pg` brute
(même patron que `scripts/apply-rls.js`, une connexion, tout le SQL d'un
fichier en un seul appel) puis en enregistrant chaque migration dans
`_prisma_migrations` à la main (checksum SHA-256 du fichier, comme le fait
Prisma lui-même) pour que les outils Prisma la reconnaissent comme déjà
appliquée. `scripts/apply-rls.js`, lui, a fonctionné du premier coup (même
patron de connexion unique).

**Ce qui a été migré** : compte PATRON (Elie Rwitani,
`hotelchicago@gmail.com`, nouveau mot de passe) recréé via
`scripts/creer-utilisateur.js` (déjà existant, opération par id exact) ; les
3 vraies chambres et le produit (Coca-Cola) recopiés à l'identique
(nouveaux `id`, mêmes valeurs). **Volontairement pas migré** (décision du
patron) : les comptes/sous-comptes/lignes/ventes cafétaria du 26/09,
clairement des données de test.

**Corrigé au passage** : `apps/desktop/src/main/config-store.ts` avait
`apiUrl: "http://localhost:3000"` par défaut — le port de LinkPay, pas
celui d'Hôtel Chicago (3001) — un reliquat jamais corrigé jusqu'ici, profité
de l'édition de ce fichier pour le réparer.

**Fichiers mis à jour** : `apps/api/.env`, `packages/database/.env`
(nouvelles URL/clés), `apps/mobile/src/stockage/configuration.ts`,
`apps/desktop/src/main/config-store.ts`,
`apps/desktop/src/renderer/src/navigateur-secours.ts` (nouvelles valeurs
par défaut). L'appareil mobile déjà utilisé aujourd'hui a été réinitialisé
(`pm clear`) pour repartir sur ces nouvelles valeurs par défaut plutôt que
sur l'ancienne configuration mémorisée localement — pas d'écran dans l'app
pour éditer l'URL/la clé Supabase directement, seulement l'URL de l'API.

Vérifié : connexion Supabase Auth réussie avec le nouveau compte,
`GET /auth/me` renvoie bien le rôle PATRON, `GET /public/menu` renvoie le
produit recréé, reconnexion réelle depuis l'app mobile confirmée par le
patron. Vitesse inchangée par rapport à l'ancien projet (attendu, toujours
en mode transaction) : ~1,2 à 3,7s par requête Prisma.

## Migration Prisma 5.22 → 7.10 + adaptateur `pg` : la lenteur résolue, 27/09/2026

**Le diagnostic de la Phase 6 (« Prisma ne réutilise pas sa connexion »)
était faux.** Mesure instrumentée (`log: [{ emit: "event", level: "query" }]`)
d'un `produit.findFirst()` répété trois fois contre la vraie base, avant
migration :

```
BEGIN 275 ms → DEALLOCATE ALL 278 ms → SELECT 551 ms → COMMIT 562 ms = 1683 ms
(puis 1656 ms, 1395 ms — identique à chaque fois)
```

La connexion EST réutilisée (pool interne du moteur). Le coût vient de
`?pgbouncer=true` : dans le code source du moteur Rust
(`query-engine/request-handlers/src/load_executor.rs`, identique en 5.22 et
6.19), ce paramètre met `force_transactions = true` → chaque opération, même
une lecture, est enveloppée dans `BEGIN`/`COMMIT`, précédée d'un
`DEALLOCATE ALL`, et le cache d'instructions préparées est mis à zéro (prepare
+ execute = deux allers-retours). Six allers-retours × 220–400 ms depuis
Kasindi = les 1,2 à 4 s observées. C'est un comportement documenté et connu
(issues prisma/prisma #16081, #21635 ; le dépôt trellisorg/prisma-pgbouncer-
flag-repro le reproduit en local).

**La piste « driver adapter » n'avait pas ce défaut, même en 5.22** : le
chemin `driver_adapter()` appelle `executor_for(js, false)` et une lecture
simple passe directement par `pool.query()` ; `transactionContext()` n'est
appelé que par `start_transaction`. La mesure « adapter 5.22 = 1,1–1,6 s » du
26/09 reste inexpliquée (peut-être une fuite de client : en 5.22,
`PgTransactionContext` ne relâchait jamais son client si aucune transaction
n'était démarrée) et n'a pas été re-creusée — la version 7 rend la question
sans objet.

**Ce qui a été fait** : `packages/database` passe à Prisma **7.10.0**
(`prev`, stable depuis novembre 2025 ; Prisma 8 était encore en release
candidate, API mouvante) avec `@prisma/adapter-pg` 7.10.0 et `pg` en
dépendance runtime :
- `schema.prisma` : generator `prisma-client` (le nouveau client TypeScript,
  sans moteur Rust), `output = "../src/generated/prisma"`, `moduleFormat =
  "cjs"` (le paquet et apps/api sont en CommonJS). Le dossier généré est
  gitignoré et recréé par `pnpm build` (`prisma generate && tsc`).
- Nouveau `prisma.config.ts` : le CLI y lit `DATABASE_URL` (le `url =
  env(...)` du schéma est déprécié en v7). Prisma 7 ne charge plus les `.env`
  tout seul, d'où `import "dotenv/config"` en tête.
- `src/index.ts` : `new PrismaClient({ adapter: new PrismaPg({ ... }) })`,
  avec un pool `pg` réglé explicitement — `connectionTimeoutMillis: 10 s`
  (`pg` n'a aucun délai par défaut, et TCP+TLS+auth coûtent 2–2,5 s d'ici),
  `idleTimeoutMillis: 10 min` (`pg` ferme à 10 s par défaut, ce qui aurait
  fait repayer 2,5 s à chaque creux d'activité de la réception), `max: 5`.
- `apps/api` : `src/charger-env.ts` importé en PREMIER dans `main.ts` (la
  base est initialisée pendant l'évaluation des imports de `app.module.ts`,
  donc avant `ConfigModule.forRoot()`) ; `PrismaModule.onModuleInit` exécute
  un `SELECT 1` pour ouvrir la première connexion au démarrage (`$connect()`
  seul n'ouvre aucune connexion `pg`, mesuré) — le boot journalise
  « Connexion Postgres établie en ~2 s » et la première requête d'un
  réceptionniste ne paie plus ce délai.
- `.env` : `?pgbouncer=true` retiré. Le pooler reste en mode transaction
  (port 6543) : l'adaptateur `pg` envoie des instructions **non nommées**
  (Parse/Bind/Execute/Sync en un paquet = une transaction implicite), donc
  aucun conflit de prepared statements, sans `DEALLOCATE ALL`. Les vraies
  transactions (`$transaction`) prennent un client dédié `BEGIN`…`COMMIT`.

**Mesures après migration**, même script, même base :
- `findFirst` : 271–294 ms par requête, **une seule** instruction SQL (× 6
  plus rapide ; la première requête d'un process paie ~2 s d'ouverture de
  connexion, d'où la pré-chauffe au boot de l'API).
- 50 requêtes différentes en séquence (10 modèles, `include`, `count`,
  `where`), 10 en parallèle sur 5 connexions, une transaction batch et une
  transaction interactive : **zéro erreur** de prepared statement.
- Via l'API : `GET /public/chambres-disponibles` en 280–290 ms de bout en
  bout dès le premier appel.
- `pnpm --filter api test` : 127 tests verts sans modification des specs
  (`Prisma.TransactionClient`, `Prisma.PrismaClientKnownRequestError`,
  `$transaction` inchangés en v7) ; `tsc` propre partout.

**Migrations** : `prisma migrate status` (v7) échoue encore via le pooler
(« Schema engine error »), comme `migrate deploy` (v5) le 27/09 — le moteur de
schéma a besoin d'une session stable. La manipulation manuelle du 27/09 est
formalisée en `scripts/appliquer-migrations.js` (`pnpm migrate:appliquer`,
`pnpm migrate:verifier`) : même patron qu'`apply-rls.js` (une connexion `pg`,
tout le fichier SQL en un appel), une transaction par migration, et
l'enregistrement dans `_prisma_migrations` avec le checksum SHA-256 du fichier
— vérifié : les trois migrations existantes sont reconnues avec un checksum
identique à celui écrit par Prisma. Créer une nouvelle migration reste
`prisma migrate dev` contre une base locale/directe ; ce script ne fait que
l'appliquer.

**Toujours non résolu, indépendant de ce chantier** : le pooler en mode
session (5432) muet. Précision utile : la comparaison avec LinkPay ne prouve
rien — sa « Direct connection » (`db.<ref>.supabase.co`) ne résout, comme la
nôtre, qu'en IPv6, et ce poste n'a aucune connectivité IPv6 (`ping -6`
échoue) ; LinkPay ne peut donc pas l'utiliser depuis ce PC non plus. Ce qui
distinguerait un blocage réseau local d'un problème Supabase : tester
`pooler…:5432` depuis un autre réseau (partage de connexion du téléphone).

## render.yaml (section 15)

Non créé dans cette passe : le déploiement Render est une étape de la Phase
8 du plan de réalisation, après que les modules métier réels existent.
Créer un `render.yaml` maintenant, pointant vers une API qui n'expose que des
routes stub, n'aurait pas de valeur et créerait un faux sentiment
d'achèvement.

## Phase 6 (suite 2) — correctifs miroir cafétéria trouvés sur appareil réel, 27/09/2026

Trois défauts liés, découverts en observant une `LigneCommande` rejetée par
le serveur **52 fois** (« le sous-compte n'appartient pas au compte ») sur le
téléphone après la migration Prisma 7 :

1. **Enfant embarqué jamais re-mappé** : `ouvrirCompte` crée le premier
   sous-compte côté serveur avec son propre id, mais la réponse sync ne
   renvoyait que le `remoteId` du compte — le sous-compte local gardait
   `remoteId NULL` à jamais, et le pull suivant créait son doublon sous le
   vrai id serveur (deux « Juif » affichés). Corrigé de bout en bout : le
   client envoie `premierSousCompteLocalId` dans le payload du CREATE
   CompteCafeteria, `SyncService` renvoie `enfants[]` (mapping
   localId→remoteId), le moteur répercute via `confirmerPush` immédiatement
   — le pull ultérieur fusionne alors au lieu de dupliquer
   (`upsertSousCompte` matche déjà par `remoteId OR id`).
2. **Rejet métier retenté indéfiniment** : un statut `ERROR` (validation
   serveur, erreur déterministe — pas une panne réseau) incrémentait
   `attempts` mais l'opération était re-poussée à chaque poll (~20 s), soit
   ~300 ms d'aller-retour gaspillé par cycle sur une connexion coûteuse.
   `SEUIL_ECHEC_DEFINITIF = 3` (exporté du sync-engine, réutilisé par
   l'écran Synchronisation au lieu de sa constante locale) : au-delà, plus
   de push — l'op reste en file dans « Actions échouées » pour retrait
   manuel (`annulerOperation` + `supprimerEcritureCafeteriaLocale`, qui
   supprime désormais en cascade les enfants miroir : lignes du sous-compte,
   sous-comptes du compte).
3. **Join miroir incomplet** : `assemblerComptes` joignait
   `sous_comptes.compteId` / `lignes_commande.sousCompteId` à l'id **local**
   seul, alors que le pull réécrit ces colonnes avec l'id **serveur** — un
   sous-compte confirmé (remoteId renseigné, compteId réécrit en remote par
   l'upsert) devenait invisible à l'écran. Le join accepte désormais les
   deux clés (local OU remote). Avant le correctif, ce bug masquait le
   premier : seul le sous-compte fantôme (compteId local) s'affichait.

Garde-fou UI : « ajouter une ligne » est aussi bloqué sur un sous-compte
`remoteId === null` (fantôme créé par un ancien build, jamais
synchronisable), pas seulement s'il a une op en file.

Validé sur appareil réel : compte « Table Test » + sous-compte « Testeur »
créés hors ligne → push → `remoteId` renseigné sur les deux, pull sans
doublon, carte visible après rechargement. Tests : 11/11 sync-engine dont 2
nouveaux (mapping enfants, arrêt au seuil), 127/127 API.
