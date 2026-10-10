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

## HotelSaver — Phase 1 : fondations multi-tenant, 27/09/2026

Début de la transformation d'Hôtel Chicago (mono-tenant) en HotelSaver, une
plateforme multi-hôtels en libre-service (deux documents de référence
fournis par le patron : le prompt maître d'architecture, et un document de
séquencement pour l'inscription en libre-service). Vu l'ampleur (5
applications, facturation/licences, domaines personnalisés, génération de
palette — plusieurs semaines de travail), le travail est découpé en phases,
chacune avec son propre plan. Cette entrée documente uniquement la Phase 1 :
poser le schéma multi-tenant et migrer les données réelles existantes vers
un unique `Hotel`.

**Schéma** : nouvel enum `StatutLicence` (ESSAI/ACTIF/SUSPENDU/RESILIE),
nouveau modèle `Hotel` (id, nom, `sousDomaine` unique, statutLicence,
contacts — pas de champ de facturation, ça viendra avec le module
Super-Admin) et `HotelBranding` (relation 1-1, `onDelete: Cascade` — seule
exception à `Restrict`, supprimer un hôtel doit supprimer sa propre fiche de
marque). La charte graphique est stockée comme un unique JSON (`palette`,
claire + sombre) plutôt que des dizaines de colonnes scalaires : jamais
interrogée colonne par colonne en SQL. Puis `hotelId` + relation `Restrict`
+ `@@index` ajoutés sur les 12 modèles existants.

**Migration écrite à la main** (`20260927120000_multi_tenant_foundations`),
pas via `prisma migrate dev` : ce dernier a besoin d'une connexion
directe/shadow-db, toujours inaccessible depuis cette machine (pooler
session 5432 sans route IPv6 — voir l'entrée Prisma 7 ci-dessus). Réutilise
le mécanisme déjà en place (`appliquer-migrations.js`, `migrate:verifier`/
`migrate:appliquer`) : SQL écrit main dans le style exact des 3 migrations
existantes, appliqué en une transaction, checksum SHA-256 enregistré dans
`_prisma_migrations`. Un seul `Hotel` créé (id fixe
`d4b39c38-fc2c-45d5-9f57-c94d8357719d`, nom "Hôtel Chicago", `sousDomaine =
"chicago"`, **statutLicence = ACTIF** — pas ESSAI, ce sont de vraies données
de production), avec sa `HotelBranding` (police Fraunces/Public
Sans/IBM Plex Mono, palette copiée telle quelle de `apps/mobile/src/tokens.ts`
et `packages/ui/src/tokens.css`). Toutes les lignes existantes des 12 tables
(1 Utilisateur, 3 Chambre, 1 Produit, + les comptes cafétaria de test du
jour) rattachées à cet hôtel par un `UPDATE` inconditionnel.

**Point technique important — `DEFAULT` temporaire sur `hotelId`** : aucun
service NestJS actuel (`chambres`, `produits`, `reservations`, `public`,
`factures`, `cafeteria`, ~9 sites de `.create()`) ne fournit `hotelId`
aujourd'hui. Sans valeur par défaut au niveau colonne, la migration aurait
cassé immédiatement toute création (y compris via `POST /sync/push`, qui
délègue aux mêmes méthodes de service) dès son application. Chaque colonne
`hotelId` a donc `DEFAULT 'd4b39c38-...'` en plus du `NOT NULL` — couvre le
trou automatiquement, sans toucher au code applicatif, cohérent avec le
principe de cette phase (schéma + donnée seulement, aucun changement de
logique métier). **À faire en Phase 2**, au moment exact où chaque site de
`.create()` sera modifié pour fournir un `hotelId` explicite issu du
contexte d'authentification (JWT `hotel_id` + `HotelScopeGuard`) : retirer
ce `DEFAULT` (`ALTER COLUMN "hotelId" DROP DEFAULT`) sur les 12 tables. Si
oublié sur une seule table le jour où un deuxième hôtel existe, cette table
assignerait silencieusement ses nouvelles lignes à Hôtel Chicago — un bug
d'intégrité silencieux, pas un crash.

**Décision laissée hors scope, à traiter en Phase 2** :
`Chambre.numero`/`Facture.numeroRecu`/`VenteCafeteria.numeroRecu` restent
`@unique` globalement (pas `@@unique([hotelId, ...])`). `genererNumeroRecu`
(`factures.service.ts`/`cafeteria.service.ts`) fait un `orderBy: numeroRecu
desc` global sans filtre — scoper la contrainte sans réécrire cette
génération créerait une incohérence. Sans risque tant qu'un seul hôtel
existe.

**RLS** : aucun changement à `rls-policies.sql` (confirmé : aucune policy ne
référence de colonne affectée). `Hotel`/`HotelBranding` sans RLS pour
l'instant — impact nul, la connexion API utilise la clé `service_role`, qui
contourne RLS. Découverte en marge (non liée à cette migration) :
`apply-rls.js` n'est pas idempotent (`CREATE POLICY` sans `DROP POLICY IF
EXISTS` au préalable) — le rejouer échoue sur la première policy déjà
existante, sans rien altérer ; à corriger un jour, pas bloquant ici.

**Vérifié** : `prisma validate` propre, `migrate:verifier` → 1 migration en
attente puis 0, script ponctuel de contrôle (`hotelId` correct sur 100% des
lignes des 12 tables + Hotel/HotelBranding bien créés, supprimé après
usage), 127/127 tests API toujours passants (aucune régression — un flake
transitoire du pooler au premier run, causé par le `SELECT 1` de
préchauffage de `PrismaModule.onModuleInit`, pas par le schéma ; confirmé en
relançant).

**Hors scope de cette Phase 1** (chacun un plan séparé à venir) : claim JWT
`hotel_id` (hook Supabase Auth), `HotelScopeGuard`, filtrage `hotelId` dans
chaque service + retrait du `DEFAULT`, `@@unique([hotelId, ...])` sur les
numéros, modèle `PaiementLicence`, module Super-Admin
(`POST /super-admin/hotels`, onboarding manuel `ACTIF` direct), inscription
en libre-service (`POST /public/hotels/inscription`, toujours `ESSAI`),
génération automatique de palette, site public multi-hôtels (`apps/web`),
domaines personnalisés (API Render), `Role.SUPER_ADMIN`.

## HotelSaver — Phase 2 : filtrage par hôtel dans l'API, 27/09/2026

Suite de la Phase 1 : chaque service NestJS lit/écrit désormais `hotelId`
explicitement, au lieu de compter sur le `DEFAULT` posé en Phase 1.

**Simplification trouvée en concevant cette phase** : pas besoin du claim JWT
`hotel_id` ni d'un hook Supabase Auth. `SupabaseAuthGuard` charge déjà
`Utilisateur` depuis la base à chaque requête (pour le rôle) — il attache
maintenant `hotelId: utilisateur.hotelId` à `request.user` à partir de cette
même ligne, sans dépendance externe. Pas de `HotelScopeGuard` distinct non
plus : aucune route actuelle n'a de `hotelId` dans son URL, donc le filtrage
au niveau de chaque requête Prisma **est** l'enforcement (une ressource d'un
autre hôtel devient introuvable : 404, pas une fuite). Le claim JWT + hook +
RLS scopée par hôtel restent utiles pour un accès direct PostgREST
hypothétique (RLS est contournée par la clé `service_role` que l'API
utilise) — repoussés à une phase séparée si ce besoin apparaît réellement.

**Audit exhaustif** des ~9 fichiers de service (chambres, produits,
réservations, factures, cafétaria, stock, dashboard, sync) : chaque
`where`/`data` direct a gagné `hotelId`, chaque validation d'une clé
étrangère fournie par l'appelant (chambreId, clientId, produitId,
reservationId dans un DTO) a été revérifiée avec `hotelId` (sinon un
utilisateur pouvait référencer une ressource d'un autre hôtel par son id).
Deux points non triviaux trouvés à l'audit :
- Les écritures Prisma imbriquées n'héritent PAS automatiquement du
  `hotelId` du parent : `CafeteriaService.ouvrirCompte` crée un
  `CompteCafeteria` + un `SousCompte` imbriqué, qui avait besoin de son
  propre `hotelId` explicite.
- `sync.service.ts` avait deux points à fuite réelle (pas juste un filtrage
  manquant) : le `findUnique` générique du push/UPDATE renvoyait la ligne
  complète d'un autre hôtel dans `donneesServeur` en cas de conflit de
  version, **avant** même d'atteindre le contrôle de rôle du service métier
  sous-jacent ; et le `findMany` générique du pull (un seul `where` partagé
  par les 9 entités via `ACCESSEUR_PRISMA`) n'avait aucun filtre `hotelId` —
  un seul ajout corrige les 9 d'un coup.
- Deux requêtes `TauxChange` (`factures.service.ts`, `cafeteria.service.ts`)
  n'avaient aucun `where` du tout (`orderBy` seul) — la fuite la plus facile
  à manquer, puisqu'il n'y avait pas de `where` existant pour rappeler d'y
  penser.

**Numérotation des reçus** : `Facture.numeroRecu`/`VenteCafeteria.numeroRecu`
passent de `@unique` global à `@@unique([hotelId, numeroRecu])` (décision
explicitement repoussée en Phase 1), et `genererNumeroRecu` (les deux
services) filtre désormais par `hotelId` — la numérotation redevient par
hôtel plutôt que globale.

**Découverte annexe, corrigée** : `public.service.ts` (routes anonymes, pas
de JWT) ne compilait déjà plus depuis la Phase 1 sans que personne s'en
aperçoive — `hotelId` étant un champ requis dans les types Prisma générés
dès l'ajout du champ au schéma (indépendamment du `DEFAULT` côté base), mais
`ts-jest` ne fait pas de vérification de type stricte par défaut, donc les
127 tests passaient malgré l'erreur de compilation. Corrigé par un
`hotelUnique()` (`this.prisma.hotel.findFirstOrThrow()`) : correct tant
qu'un seul hôtel existe, explicitement documenté comme provisoire — la vraie
résolution de tenant pour un visiteur anonyme (sous-domaine, slug) reste une
décision du futur site public (`apps/web`), pas traitée ici.

**Migration finale** (`20260927150000_hotel_scoping_enforcement`, même
mécanisme manuel que la Phase 1) : `DROP DEFAULT` sur les 12 colonnes
`hotelId`, et les deux nouvelles contraintes composées sur `numeroRecu`.
Appliquée seulement après vérification complète du code (ordre inverse de la
Phase 1, qui ajoutait un filet de sécurité — celle-ci le retire). Vérifié en
direct après application : `column_default` à `null` sur les 12 colonnes,
les deux nouveaux index uniques composés existent
(`Facture_hotelId_numeroRecu_key`, `VenteCafeteria_hotelId_numeroRecu_key`).

**Vérifié** : 127/127 tests API toujours passants après chaque étape
(threading `hotelId`, puis retrait du `DEFAULT`).

**Hors scope de cette Phase 2** (inchangé depuis la Phase 1, plus la
résolution de tenant pour `public.service.ts`) : claim JWT `hotel_id`, hook
Supabase Auth, RLS scopée par hôtel, `PaiementLicence`, module Super-Admin,
inscription en libre-service, site public, domaines personnalisés,
`Role.SUPER_ADMIN`.

## HotelSaver — Phase 3 : module Super-Admin + onboarding manuel d'un hôtel, 27/09/2026

Avant cette phase, un seul hôtel existait (créé directement par une
migration en Phase 1) — aucun moyen de créer un deuxième tenant pour de vrai
tester le travail des Phases 1/2. Ajout d'un module Super-Admin avec un
endpoint d'onboarding manuel.

**Bug découvert et corrigé en marge** : `scripts/creer-utilisateur.js` (seul
endroit du repo qui crée une ligne `Utilisateur` en direct) ne renseignait
jamais `hotelId` — cassé depuis que la Phase 2 a retiré le `DEFAULT` de
cette colonne (violation NOT NULL systématique). Corrigé : `hotelId` est
maintenant un 4e argument obligatoire
(`creer-utilisateur <email> "<nom>" <ROLE> <hotelId>`).

**Décision d'architecture — `SuperAdmin` comme modèle séparé, pas
`Role.SUPER_ADMIN`** : les deux documents de référence HotelSaver proposaient
d'ajouter `SUPER_ADMIN` à l'enum `Role` existant. Après la Phase 2 (chaque
service filtre strictement par `hotelId`, FK obligatoire sur `Utilisateur`),
mélanger un rôle "sans hôtel" dans ce même modèle aurait réintroduit un cas
`hotelId` nullable dans tout le code qu'on venait de durcir. Choix retenu :
nouveau modèle `SuperAdmin` (`id, nom, actif, supabaseAuthId, createdAt`,
sans `hotelId`, sans champ `role` — un seul niveau de super-admin pour
l'instant), avec son propre guard (`SuperAdminAuthGuard`, copie conforme de
`SupabaseAuthGuard` mais contre la table `SuperAdmin`) et son propre type
(`SuperAdminAuthentifie`). Un même membre de l'équipe peut avoir un compte
ici ET un compte `Utilisateur` pour un hôtel test, sans lien entre les deux.
Pas de RLS sur cette table (même raisonnement que `Hotel`/`HotelBranding` en
Phase 1 : la clé `service_role` de l'API contourne RLS de toute façon).

**Module** (`apps/api/src/super-admin/`, guardé par `SuperAdminAuthGuard`
seul — pas de `RolesGuard`, rien à distinguer avec un seul niveau) :
`POST /super-admin/hotels` (statutLicence **ACTIF direct**, jamais `ESSAI` —
ce n'est pas le formulaire public, qui reste hors scope), `GET /super-admin/hotels`,
`PATCH /super-admin/hotels/:id/statut`. La `HotelBranding` est créée dans la
même transaction Prisma imbriquée (`branding: { create: {...} } }`), avec une
**palette générique** (`palette-defaut.ts`, gris/bleu neutre) — jamais celle
d'Hôtel Chicago, qui reste sa propre marque. La création du premier
utilisateur PATRON d'un nouvel hôtel reste un geste séparé via
`creer-utilisateur.js` (corrigé ci-dessus), cohérent avec la façon dont
Hôtel Chicago lui-même a toujours été géré.

**Amorçage** : `scripts/creer-super-admin.js` (copie conforme de
`creer-utilisateur.js`, opération par id exact) crée le tout premier compte
Super-Admin — nécessaire puisque rien n'existait encore pour s'authentifier
contre ce nouveau module.

**Vérifié** : `tsc --noEmit` propre, `pnpm --filter api build` propre,
132/132 tests (127 existants + 5 nouveaux pour `SuperAdminService`).

**Hors scope de cette Phase 3** : `PaiementLicence`/facturation, expiration
des essais `ESSAI`, inscription en libre-service
(`POST /public/hotels/inscription`), génération automatique de palette
(`node-vibrant`), site public multi-hôtels (`apps/web`), domaines
personnalisés (API Render), interface visuelle du panel Super-Admin
(`apps/super-admin` — cette phase ne construit que l'API), claim JWT
`hotel_id`, RLS scopée par hôtel.

**Test réel effectué** (27/09/2026) : compte Super-Admin créé
(`creer-super-admin.js`), connexion via Supabase Auth REST
(`/auth/v1/token?grant_type=password`), `POST /super-admin/hotels` a créé un
deuxième hôtel réel ("Hôtel Test", `hotel-test`) avec sa propre
`HotelBranding` (palette générique, bien distincte de la navy d'Hôtel
Chicago). Isolation vérifiée en base : Hôtel Chicago garde ses 3 chambres et
1 produit, Hôtel Test en a 0 — preuve concrète que le filtrage de la Phase 2
fonctionne avec un vrai deuxième tenant. Incident mineur corrigé en route :
le caractère "ô" du nom du test a été corrompu par l'encodage de `curl` en
Git Bash avant d'atteindre la base (`H�tel Test`, U+FFFD) — corrigé par une
mise à jour directe en base (donnée de test uniquement, aucun impact sur
Hôtel Chicago). À retenir : préférer un script Node pour toute donnée
contenant des caractères accentués plutôt qu'un `curl -d` inline en Git Bash.

## HotelSaver — Phase 4 : inscription en libre-service (backend), 27/09/2026

Ajout de `POST /public/hotels/inscription` : contrairement à l'onboarding
manuel du Super-Admin (Phase 3, `ACTIF` direct, deux étapes volontairement
séparées), ce chemin est en libre-service — un propriétaire inconnu
s'inscrit lui-même, toujours en `ESSAI`, et doit repartir avec un compte qui
fonctionne sans intervention humaine. Un seul `prisma.hotel.create` imbriqué
crée `Hotel` + `HotelBranding` (palette générique, déplacée vers
`apps/api/src/common/palette-defaut.ts`, partagée avec le module
Super-Admin) + le premier `Utilisateur` PATRON, atomique côté base.

**Lacune corrigée** : `Hotel.statutLicence` n'était vérifié nulle part —
`PATCH /super-admin/hotels/:id/statut` pouvait mettre un hôtel en `SUSPENDU`
sans aucun effet réel. `SupabaseAuthGuard` charge désormais `hotel: true` et
rejette (401) si `SUSPENDU`/`RESILIE`. `ESSAI`/`ACTIF` restent équivalents
pour l'instant (pas de date d'expiration d'essai — `PaiementLicence`, hors
scope, phase facturation).

**Nouveau `SupabaseAdminService`** (`apps/api/src/common/supabase-admin/`) :
reprend le helper `appelAdmin` déjà utilisé par les scripts CLI
(`creer-utilisateur.js`, `creer-super-admin.js`), pour appeler l'API Admin
Supabase Auth depuis une requête HTTP entrante plutôt qu'un script. Compte
créé avec `email_confirm: false` (contrairement aux scripts CLI internes :
un inscrit en libre-service est un inconnu, pas un compte déjà vérifié par
un humain de confiance — Supabase envoie son e-mail de confirmation par
défaut ; un lien universel personnalisé reste un chantier séparé).

**Bug réel trouvé en testant en direct** (pas en écrivant les tests unitaires
— seul un vrai rejeu avec le même email l'a révélé) : un email déjà
enregistré renvoyait une erreur Supabase 422 remontée en 500 générique,
au lieu d'un 409 propre — un cas très courant en libre-service (formulaire
soumis deux fois). Corrigé dans `SupabaseAdminService` : un 422 Supabase Auth
Admin devient systématiquement une `ConflictException`. Test de régression
ajouté (`supabase-admin.service.spec.ts`, fetch mocké).

**Vérifié en direct** (serveur local, vrai projet Supabase) :
- Inscription avec un sous-domaine inédit → hôtel `ESSAI` créé avec sa
  charte graphique générique et son premier PATRON, encodage UTF-8 correct
  (piège du 27/09 sur `curl -d` évité en passant le corps par fichier,
  `--data-binary @fichier.json`).
- Rejeu avec le même email → `409` propre (plus de 500).
- Sous-domaine déjà pris (email différent) → `409`, compte Supabase créé
  puis supprimé (rollback confirmé : reprendre ce même email juste après
  avec un sous-domaine libre a réussi sans conflit).
- Le comportement `SUSPENDU`/`RESILIE` du guard est couvert par un test
  unitaire dédié (`supabase-auth.guard.spec.ts`) plutôt que testé en direct
  sur un vrai compte — éviter de suspendre, même brièvement, un hôtel réel
  (Hôtel Chicago) ou un hôtel de test sans utilisateur à qui le faire
  vérifier.
- 141/141 tests, build et typecheck propres.

**Hors scope de cette phase** : génération automatique de palette depuis un
logo (`node-vibrant`), assistant d'inscription mobile, site public
(`apps/web`), lien universel personnalisé de vérification d'email,
`PaiementLicence`/expiration réelle d'un essai, domaines personnalisés.

## HotelSaver — Phase 5 : génération automatique de palette depuis un logo, 27/09/2026

Un logo fourni à l'inscription (libre-service ou onboarding manuel) permet
désormais de dériver une vraie charte de marque au lieu de la palette
générique fixe (Phase 3/4).

**Écart assumé face au prompt d'origine** : celui-ci plaçait cette fonction
dans `packages/ui/theme/generate-palette.ts`. Vérifié que `packages/ui` est
un système de design **React pour le web** (`peerDependency react`, imports
CSS, tests jsdom) — y importer une fonction pure depuis `apps/api` (backend
Node sans React) risquait d'entraîner du code dépendant de React à
l'exécution. La fonction vit donc dans `apps/api/src/common/palette/`, à
côté de `palette-defaut.ts` (Phase 4).

**Choix de dérivation partielle** : seuls les tokens d'identité de marque
(`bleu`/`bleuHover`/`bleuClair`/`bleuTresClair`, `navy`/`navyForte`) sont
dérivés du logo (`genererPalette`, fonction pure, testée isolément) ; tout
le reste (surfaces, bordures, encre, `succes`/`danger`/`alerte`/`info`)
reste figé sur `PALETTE_DEFAUT` — un logo saturé ne doit jamais rendre un
état sémantique illisible. Le `bleu` dérivé est systématiquement assombri
si besoin (conversion hex→HSL à la main, ~80 lignes, pas de dépendance
supplémentaire) jusqu'à respecter un contraste WCAG AA (`>= 4.5`) contre
blanc ; le thème sombre reçoit l'inverse (une version plus claire de la
même teinte, lisible sur fond sombre).

**Librairie vérifiée avant adoption** (risque réel dans ce projet :
dépendances natives cassées sous Windows, cf. Prisma/pg) :
`node-vibrant@4.0.4`, point d'entrée `node-vibrant/node`, dont la
dépendance `@vibrant/image-node` utilise `@jimp/*` — décodage d'image en JS
pur, aucune dépendance native (`canvas`, `node-gyp`), sûr sur Windows/Node 24.
`extraireCouleursLogo` ne lève jamais (URL cassée, décodage impossible,
timeout → `null`) : un logo mal formé ne doit jamais faire échouer une
inscription.

**Intégration** : `InscriptionHotelDto`/`CreerHotelDto` gagnent un champ
optionnel `logoUrl` (même convention que `Chambre.photos`/`Produit.photo` —
le client téléverse sur Supabase Storage, l'API ne reçoit qu'une URL,
aucun endpoint d'upload n'existe dans ce backend). Sans `logoUrl` (ou si
l'extraction échoue), comportement des Phases 3/4 strictement inchangé
(`PALETTE_DEFAUT`).

**Vérifié en direct, sans aucun mock** (pas seulement les tests unitaires) :
un vrai serveur HTTP local servant un vrai PNG généré à la main (rouge puis
vert, deux logos distincts) a été utilisé pour exercer le vrai pipeline
`fetch → node-vibrant → genererPalette`, y compris via le vrai endpoint
`POST /public/hotels/inscription` (pas seulement en isolation) :
- Logo rouge → `light.bleu = #DC2424`, contraste contre blanc = 4.86
  (≥ 4.5), tokens neutres inchangés.
- Logo vert (via l'endpoint HTTP réel) → `light.bleu = #197F42`, différent
  du rouge et de `PALETTE_DEFAUT`, `HotelBranding.logoUrl` bien enregistrée.
- Logo cassé (404) → inscription réussit quand même, palette par défaut
  (bug trouvé et corrigé dans le script de test lui-même en route : un
  serveur de test mal écrit renvoyait 200 à toute URL — pas un bug du code
  produit).
- 154/154 tests, build et typecheck propres.

**Hors scope de cette phase** : téléversement du logo (reste géré côté
client), personnalisation manuelle de la palette après coup, assistant
mobile, site public (`apps/web`).

## HotelSaver — Phase 6 : assistant d'inscription côté mobile, 27/09/2026

`POST /public/hotels/inscription` (Phase 4) n'était utilisable qu'en ligne
de commande. Ajout de l'écran mobile correspondant.

**Contrainte de conception respectée** : `apps/mobile` n'a aucun routeur au
niveau racine — `App.tsx` aiguille par état (`Ecran`), `react-navigation`
n'étant utilisé qu'à l'intérieur de l'onglet authentifié. Nouvel état
`"inscription"`, `EcranInscription.tsx` purement présentationnel (même
contrat que `EcranConnexion.tsx` : `erreur`/`enCours`/callbacks), 2 étapes
gérées par un `useState` interne au composant, pas par un routeur.

**Téléversement du logo repoussé une troisième fois** (Phases 4, 5, 6) :
aucun code de téléversement vers Supabase Storage n'existe nulle part dans
ce projet, et l'exposer à un visiteur non authentifié (l'inscription
précède la création du compte) demanderait soit une politique Storage
ouverte à `anon` en écriture (risque d'abus réel), soit un premier endpoint
d'upload multipart côté API. Les deux sont des chantiers de sécurité/infra
à part entière — l'assistant reste à 2 étapes, l'hôtel démarre avec la
palette générique.

**Nouveau `packages/api-client/src/public.ts`** : `inscrireHotel`, fonction
autonome comme `connecterAvecMotDePasse` (pas une méthode de `ClientApi`,
qui exige un jeton déjà présent à la construction — inadapté avant
authentification). `packages/types` gagne `InscriptionHotelPayload`/
`HotelCree`/`StatutLicence`, partagés entre l'API et le client.

**Piège identifié et évité** : le compte Supabase créé par
`PublicService.inscrireHotel` a `email_confirm: false` (choix volontaire de
la Phase 4) — la première tentative de connexion juste après l'inscription
peut donc échouer tant que l'email n'est pas confirmé. `sInscrire` (App.tsx)
ne traite jamais ce cas comme un échec d'inscription (l'hôtel existe bel et
bien) : si la connexion automatique échoue, retour à l'écran de connexion
avec un message clair ("Compte créé ! Vérifiez votre boîte mail...") plutôt
que de réafficher l'erreur brute de `connecterAvecMotDePasse`
(`email_not_confirmed` → "Contactez le patron", un message qui n'aurait
aucun sens pour quelqu'un qui vient de créer SON propre compte).

**Vérifié** : `pnpm --filter @hotel-chicago/api-client test` (24/24, dont 4
nouveaux pour `inscrireHotel` : succès, sous-domaine pris, email déjà
enregistré, erreur réseau), `npx tsc --noEmit` dans `apps/mobile` propre.
Test réel sur appareil laissé au patron (pas d'appareil connecté à cette
session, comme pour chaque fonctionnalité mobile de ce projet).

**Hors scope de cette phase** : téléversement de logo, lien universel
personnalisé de vérification d'email, écran de personnalisation de la
marque après coup, site public (`apps/web`), assistant équivalent côté
desktop.

## HotelSaver — Phase 7 : panel Super-Admin (apps/super-admin), 27/09/2026

Le module Super-Admin (Phase 3) n'était utilisable qu'en ligne de commande.
Nouvelle app web interne : lister les hôtels, en créer un (onboarding
manuel, `ACTIF` direct), changer le statut d'un hôtel existant.

**Outillage** : Vite + React + TypeScript, pas Next.js — confirmé qu'aucune
trace de Next.js n'existe nulle part dans ce monorepo ; `apps/desktop`
utilise déjà exactement cette pile pour son renderer Electron
(`@vitejs/plugin-react`, React 18.3.1). `apps/super-admin` reprend la même
chose en Vite pur. `pnpm-workspace.yaml` découvre `apps/*` automatiquement,
`turbo.json` générique (pas d'entrée par paquet à ajouter).

**Réutilisation confirmée avant d'écrire quoi que ce soit** :
`packages/ui` (déjà consommé par `apps/desktop` de la même façon — imports
CSS directs, zéro config Vite spéciale) et `packages/api-client`/
`packages/types` (confirmés framework-agnostiques, déjà bâtis en CJS/ESM
consommables par Vite comme mobile/desktop le font). Pas de nouvelle
identité visuelle "HotelSaver plateforme" : reste celle de `packages/ui`,
c'est un outil interne, pas la vitrine publique.

**Nouveau `packages/api-client/src/super-admin.ts`** : `ClientSuperAdmin`,
copie conforme de `ClientApi` mais pour `/super-admin/hotels` — gardé
séparé de `ClientApi` (identité d'authentification différente,
`SuperAdminAuthentifie` pas `UtilisateurAuthentifie`), même raisonnement
que `SuperAdminAuthGuard` séparé de `SupabaseAuthGuard` côté API (Phase 3).

**Téléversement de logo toujours hors scope** (4e fois, Phases 4/5/6/7) :
le formulaire de création d'hôtel n'a pas de champ logo, cohérent avec
l'absence de tout composant d'upload dans ce projet.

**Vérifié** : `pnpm --filter @hotel-chicago/api-client test` (29/29, dont 5
nouveaux pour `ClientSuperAdmin`), `apps/super-admin` compile sans erreur
(`tsc --noEmit`), serveur de dev Vite démarré et chaque fichier source
vérifié transformé sans erreur (`main.tsx`, `App.tsx`, écrans, CSS de
`packages/ui` résolu correctement). **Vérification d'intégration réelle**
sans navigateur (aucun outil de navigateur interactif dans cet
environnement) : le `ClientSuperAdmin` compilé exact utilisé par l'app a
été exécuté directement contre le vrai backend et le vrai projet Supabase —
connexion, `listerHotels`, `creerHotel` (hôtel réellement créé), et
`changerStatutHotel` (statut réellement passé à `SUSPENDU`) confirmés un
par un. Reste au patron : cliquer réellement à travers les écrans dans un
navigateur (même limite que le mobile sans appareil connecté).

**Hors scope de cette phase** : détail d'un hôtel (consommation, factures),
tableau de bord, recherche/filtres, identité visuelle propre à HotelSaver,
déploiement réel (Render ou autre).

## HotelSaver — Phase 8 : site public (apps/web), formulaire d'inscription web, 27/09/2026

`POST /public/hotels/inscription` avait déjà un client mobile (Phase 6) et
un panel interne (Phase 7), mais aucun accès depuis un navigateur ordinaire.
Nouvelle app `apps/web` — uniquement le formulaire d'inscription pour
l'instant, même scaffold Vite+React que `apps/super-admin` (Phase 7), zéro
nouvel outil.

**Différence clé avec l'assistant mobile** : pas de connexion automatique
après inscription. Le mobile le fait parce qu'il EST l'app de gestion de
l'hôtel ; `apps/web` n'en est pas une (le personnel utilise mobile/desktop,
jamais un navigateur) — après inscription, un simple écran de confirmation
("Vérifiez votre boîte mail, puis connectez-vous depuis mobile/desktop"),
aucune session/jeton géré côté web du tout. `EcranInscription.tsx` reprend
exactement la même structure/validation en 2 étapes que son équivalent
mobile (Phase 6), portée en DOM au lieu de React Native — même
`inscrireHotel`/`InscriptionHotelPayload`, aucune nouvelle logique métier.

**Toujours hors scope** (5e fois) : téléversement de logo. Toujours pas de
résolution de tenant par sous-domaine — pas nécessaire ici, créer un hôtel
ne suppose pas d'en avoir déjà résolu un ; reste pour les futures pages
publiques propres à chaque hôtel (réservation, menu).

**Vérifié** : `apps/web` compile sans erreur, serveur de dev Vite démarré,
chaque fichier source vérifié transformé sans erreur. **Vérification
d'intégration réelle sans navigateur** (même méthode que la Phase 7) : le
module `inscrireHotel` compilé exact utilisé par l'app exécuté directement
contre le vrai backend — un hôtel réel créé en `ESSAI`. Un premier essai a
échoué avec `Connection terminated unexpectedly` côté pooler Postgres (la
fragilité déjà documentée à plusieurs reprises dans ce projet) ; un second
essai immédiat a réussi sans changement de code, confirmant un aléa
transitoire et non une régression.

**Hors scope de cette phase** : résolution de tenant par sous-domaine, page
d'accueil marketing (contenu/design), téléversement de logo, déploiement
réel, domaines personnalisés.

## HotelSaver — Phase 9 : résolution de tenant par sous-domaine + pages publiques, 27/09/2026

Depuis la Phase 2, `PublicService.hotelUnique()` résolvait toujours sur
l'unique hôtel existant — documenté à chaque phase comme provisoire, en
attendant le site public. Cette phase termine ce qui manquait : un visiteur
anonyme consulte désormais les chambres/le menu **du bon hôtel**, identifié
par sous-domaine.

**Résolution explicite, pas via l'en-tête Host** : `apps/web` détermine son
propre sous-domaine (`window.location.hostname`) et le transmet
explicitement à chaque appel (`resoudreSousDomaine.ts`) ; le backend
(`PublicService.resoudreHotel`) filtre juste par ce qu'on lui donne, ne fait
confiance à aucun en-tête. `*.localhost` résout nativement vers 127.0.0.1
(RFC 6761) — pas besoin de configuration DNS pour tester de vrais
sous-domaines en local ; `?hotel=` reste un secours explicite. 404 uniforme
si le sous-domaine est inconnu OU si l'hôtel est `SUSPENDU`/`RESILIE` — même
raisonnement que le contrôle ajouté à `SupabaseAuthGuard` en Phase 4 (ne
jamais révéler qu'un sous-domaine existe mais est suspendu).

**`react-router-dom` introduit dans `apps/web` uniquement** — écart assumé :
mobile/desktop/super-admin évitent un routeur (flux d'authentification
séquentiel, aiguillage par état suffisant) ; `apps/web` a plusieurs pages
indépendantes et partageables par URL (`/`, `/chambres`, `/menu`), le cas
d'usage exact d'un routeur, pas une incohérence gratuite.

**Backend** : `hotelUnique()` → `resoudreHotel(sousDomaine)`
(`findUnique` + vérification du statut). `findChambresDisponibles`,
`findMenu` (nouveau `FindMenuQueryDto`, n'avait aucun DTO jusqu'ici),
`creerDemandeReservation` prennent désormais `sousDomaine`.
`packages/types` gagne `DemandeReservationPayload` ;
`packages/api-client/src/public.ts` gagne `listerChambresDisponibles`,
`listerMenu`, `creerDemandeReservationPublique` (même forme que
`inscrireHotel`, factorisées via un helper `requetePublique` commun).

**Vérifié** : 159/159 tests API (nouveaux cas 404 : sous-domaine inconnu,
`SUSPENDU`, `RESILIE`), 34/34 tests `api-client`, `apps/web` compile sans
erreur, serveur de dev Vite démarré et chaque fichier vérifié transformé
sans erreur. **Vérification d'intégration réelle sans navigateur** (même
méthode que les Phases 7/8) : les modules `listerChambresDisponibles`/
`listerMenu` compilés exacts exécutés contre le vrai backend avec
`sousDomaine=chicago` → vraies données d'Hôtel Chicago (1 chambre libre, le
produit Coca-Cola) ; avec un sous-domaine inconnu → 404 confirmé.

**Hors scope de cette phase** : réservation en ligne depuis `apps/web`
(l'endpoint existe, pas d'écran), charte graphique dynamique par hôtel sur
le site public, page d'accueil marketing, domaines personnalisés,
déploiement réel.

## HotelSaver — Phase 10 : réservation en ligne sur le site public, 27/09/2026

`POST /public/reservations` et `creerDemandeReservationPublique`
(`packages/api-client`) existaient depuis le début, ajoutés en Phase 9, mais
sans aucun écran pour les utiliser. Fil fermé : un visiteur choisit des
dates, voit les chambres réellement disponibles pour cette période
(`listerChambresDisponibles` acceptait déjà `dateArrivee`/`dateDepart`,
jamais utilisé jusqu'ici), clique une chambre, envoie une demande.

**Aucun changement backend** : tout existait déjà et était déjà testé —
phase purement UI (`EcranChambresPubliques.tsx` modifié pour ajouter un
sélecteur de dates + rendre les `RoomCard` cliquables une fois des dates
choisies ; nouveau `FormulaireDemandeReservation.tsx`, une modale simple).
État de succès dédié ("L'hôtel vous contactera pour confirmer") — jamais de
faux message de confirmation, cohérent avec `EN_ATTENTE` côté API (la
réception arbitre, comportement déjà décidé avant cette phase).

**Vérifié** : `apps/web` compile sans erreur, serveur de dev Vite démarré,
nouveaux fichiers vérifiés transformés sans erreur. **Vérification
d'intégration réelle sans navigateur** (même méthode que les Phases 7-9) :
`creerDemandeReservationPublique` (module compilé exact) exécuté contre le
vrai backend avec `sousDomaine=chicago` — une vraie `Reservation` créée en
`EN_ATTENTE`/`SITE_PUBLIC` pour la chambre 102, confirmée. Cette réservation
de test réelle (client "Test Réservation Web", 01-03/11/2026) reste en base
— sans impact (`EN_ATTENTE`, la réception peut l'ignorer/annuler), mais à
noter au patron.

**Hors scope de cette phase** : paiement en ligne/acompte, calendrier de
disponibilité visuel, modifier/annuler une demande depuis le site public,
charte graphique dynamique, domaines personnalisés, déploiement réel.

## HotelSaver — Phase 11 : charte graphique dynamique par hôtel, 27/09/2026

Depuis la Phase 5, chaque hôtel a une vraie `HotelBranding.palette`, mais
`apps/web` affichait toujours le thème fixe de `packages/ui` (celui d'Hôtel
Chicago), peu importe l'hôtel résolu par sous-domaine. Nouvel endpoint
minimal `GET /public/hotel` (réutilise le même 404 uniforme que
`resoudreHotel`, Phase 9) renvoyant `nom`/`logoUrl`/3 polices/`palette` —
volontairement sans `statutLicence`/`emailContact`, qui n'ont rien à faire
côté public.

**Table de correspondance nécessaire, pas un simple préfixage** : les clés
de `palette.light` sont françaises courtes (`bleu`, `navy`, `succes`,
`alerte`…) alors que les variables CSS de `packages/ui/src/tokens.css` sont
anglaises (`--hc-blue`, `--hc-navy`, `--hc-success`, `--hc-warning`…) — les
noms ne correspondent pas littéralement (`alerte` → `--hc-warning`, pas
`--hc-alert`). `appliquerPalette.ts` porte cette table explicitement.

**Seulement le thème clair appliqué** : `apps/web` n'a aucune bascule
clair/sombre nulle part — appliquer un thème sombre dynamique sans moyen de
le déclencher aurait été une fonctionnalité inventée. `espacements`/`rayons`
jamais variés non plus : identiques pour tous les hôtels dans
`PALETTE_DEFAUT`/`genererPalette` (Phase 5).

**Repli silencieux** : `appliquerPalette`/l'appel réseau dans `App.tsx` ne
lèvent jamais — une palette absente, mal formée, ou un appel échoué laissent
simplement le thème générique de `packages/ui` en place, jamais un blocage
de page pour un problème d'affichage.

**Vérifié** : 162/162 tests API (3 nouveaux pour `obtenirInfoPublique`),
36/36 tests `api-client`, `apps/web` compile sans erreur, serveur de dev
Vite démarré et fichiers vérifiés transformés sans erreur. **Vérification
d'intégration réelle sans navigateur** (même méthode que les Phases 7-10) :
`obtenirInfoPublique` (module compilé exact) exécuté contre le vrai backend
avec `sousDomaine=chicago` — `palette.light.bleu` renvoyé = `#1769E0`,
confirmé identique à la vraie charte d'Hôtel Chicago (`apps/mobile/src/tokens.ts`) ;
sous-domaine inconnu → 404 confirmé.

**Hors scope de cette phase** : thème sombre dynamique, affichage du logo
sur les pages, palette appliquée au formulaire d'inscription (`/`, pas
d'hôtel résolu à ce stade), domaines personnalisés, déploiement réel,
facturation/licences.

## HotelSaver — Phase 12 : facturation/licences (paiement manuel + suspension automatique), 27/09/2026

Dernière case "hors scope" répétée depuis la Phase 1 : suivi des paiements
d'abonnement et expiration réelle d'un essai/d'une licence impayée.

**Pas d'intégration de paiement en ligne** (décision du patron) : un
Super-Admin enregistre manuellement un paiement reçu par un autre canal
(virement, Mobile Money, espèces). `PaiementLicence` est un journal immuable
(jamais de update/delete) — `hotelId`, `montant`/`devise`, `methode`,
`periodeCouverteJusquau`, `note?`, `enregistreParSuperAdminId`.

**Aucune date de validité stockée sur `Hotel`** : `calculerFinValidite`
(fonction pure, `apps/api/src/super-admin/calculer-validite.ts`) dérive
toujours la date depuis le dernier `PaiementLicence.periodeCouverteJusquau`
(le plus récent par `periodeCouverteJusquau desc`), ou depuis
`createdAt + DUREE_ESSAI_JOURS` (14 jours) si l'hôtel n'a jamais payé — une
seule source de vérité, aucun champ dénormalisé à garder synchronisé.

**`POST /super-admin/hotels/:id/paiements`** : crée le `PaiementLicence` et
remet l'hôtel à `ACTIF` dans une seule `$transaction` — toujours, même pour
un hôtel `RESILIE` (décision du patron : un client qui revient après
résiliation doit pouvoir repartir en payant, sans intervention manuelle
supplémentaire pour "dé-résilier").

**Suspension automatique** : `LicenceSchedulerService` (`@nestjs/schedule`,
nouvelle dépendance, `ScheduleModule.forRoot()` dans `AppModule`), cron
quotidien à minuit, appelle `SuperAdminService.suspendreHotelsExpires()` —
extraite en méthode ordinaire (pas seulement un handler `@Cron`) pour rester
testable sans attendre un vrai déclenchement. Ne considère que
`ESSAI`/`ACTIF` : un hôtel déjà `RESILIE` n'est jamais "re-suspendu" (ça
n'a pas de sens), symétrique avec la réactivation ci-dessus. `SUSPENDU` (pas
`RESILIE`) : la distinction entre les deux statuts reste une décision
humaine du Super-Admin, jamais automatisée par le scheduler.

**`GET /super-admin/hotels`** renvoie désormais `HotelAvecValidite`
(`HotelCree` + `valideJusquau`, `packages/types`) au lieu de `HotelCree` —
calculé à la volée pour chaque hôtel (`include: { paiementsLicence: { take: 1,
orderBy: … desc } }`, pas de N+1 : un seul `findMany` avec la relation).

**Panel Super-Admin** (`apps/super-admin`) : tableau existant augmenté d'une
colonne "Valide jusqu'au" et d'un bouton "Enregistrer un paiement" par ligne
(`FormulairePaiement.tsx`, modale). Interruption de session notée ici pour
mémoire : `App.tsx` a été retrouvé non mis à jour après coup (toujours
`HotelCree[]`/sans `onEnregistrerPaiement`, alors que `EcranHotels.tsx`,
`FormulairePaiement.tsx`, `ClientSuperAdmin.enregistrerPaiement` et tout le
backend l'attendaient déjà) — `tsc --noEmit` le révélait immédiatement,
corrigé en rebranchant les 3 nouveaux états (`paiementEnCours`,
`erreurPaiement`) et le handler manquant, aucune autre logique à changer.

**Vérifié** : 171/171 tests API (dont les nouveaux `calculer-validite.spec.ts`
et les cas `enregistrerPaiement`/`suspendreHotelsExpires` de
`super-admin.service.spec.ts`), 37/37 `api-client`, build racine complet
(10/10 paquets), `tsc --noEmit` propre sur `apps/super-admin` et
`apps/mobile`.

**Hors scope de cette phase** : rappel automatique avant expiration (email),
période de grâce entre expiration et suspension effective, historique des
paiements visible dans le panel (la table `PaiementLicence` existe et est
interrogeable, aucun écran ne la liste encore), export comptable,
déploiement réel (Render), domaines personnalisés.

## HotelSaver — Phase 13 : domaines personnalisés (plomberie, sans déploiement Render), 27/09/2026

Dernière case "hors scope" restante avec la Phase 8 (déploiement réel). Le
patron n'a pas encore de compte/service Render — décision explicite :
construire toute la logique maintenant (schéma, appel Render, endpoints,
UI), testée avec `fetch` moqué, la vérification live attendra le vrai
déploiement. Flux choisi : onboarding manuel par le Super-Admin uniquement
(comme la Phase 3), jamais en libre-service — l'hôtelier communique son
domaine, le Super-Admin l'ajoute depuis le panel.

**Contrat Render vérifié avant d'écrire quoi que ce soit** (pas improvisé) :
`POST /v1/services/{serviceId}/custom-domains` (`{name}` → `id`/`name`/
`domainType`/`verificationStatus`/`redirectForName`, un domaine apex
renvoie un **tableau** incluant aussi son entrée `www.` associée), `GET`
(liste, filtrable par `name`), `DELETE /{customDomainId}`. Aucun endpoint
"vérifier maintenant" : Render vérifie lui-même la propagation DNS en
arrière-plan — `RenderDomainsService.statutDomaine` relit juste l'état déjà
calculé, ce que le bouton "Vérifier" du panel déclenche manuellement
(aucun cron automatique dans cette phase, contrairement à la suspension de
licence Phase 12).

**Schéma** : `Hotel.domainePersonnalise` (`@unique`), `domainePersonnaliseId`
(l'id Render, nécessaire pour supprimer/relire), `domaineVerifie`,
`domaineAjouteLe` — jamais écrits en base sans que l'appel Render ait déjà
réussi (pas d'état "en base mais pas chez Render"). Si l'écriture Prisma
échoue après coup (ex. `P2002` — domaine déjà utilisé par un autre hôtel
dans notre propre base), le domaine est retiré côté Render pour ne pas
laisser d'orphelin attaché au service.

**`RenderDomainsService`** (`apps/api/src/super-admin/`) : même patron que
`SupabaseAdminService` (Phase 4) — `RENDER_API_KEY`/`RENDER_WEB_SERVICE_ID`
absents → `InternalServerErrorException` avec message clair, jamais un
appel silencieusement no-op. **Vérifié en conditions réelles** (pas
seulement en test unitaire) : contre la vraie API via un vrai jeton
Super-Admin, `POST /super-admin/hotels/:id/domaine` échoue proprement avec
exactement ce message (aucune variable Render configurée dans ce projet
actuellement) — le serveur ne plante pas, l'erreur remonte lisible.

**Résolution de tenant étendue** (Phase 9) : `PublicService.resoudreHotel`
passe de `findUnique({ sousDomaine })` à `findFirst({ OR: [...] })`
essayant, dans l'ordre, le domaine personnalisé complet, le nom d'hôte
complet comme sous-domaine, puis son premier label — couvre les trois
formes (`chicago`, `chicago.hotelsaver.com`/`chicago.localhost`,
`www.hotel-chicago.com`) sans que `apps/web` ait besoin de connaître le
domaine de base final de la plateforme (toujours pas choisi). Côté client,
`resoudreSousDomaine()` transmet désormais le nom d'hôte complet tel quel
(plus seulement `labels[0]`) — le tri des trois cas se fait entièrement
côté serveur. `obtenirInfoPublique` réutilise le même filtre (`construireFiltreHote`,
factorisé) au lieu de dupliquer sa propre requête.

**Panel Super-Admin** : nouvelle colonne "Domaine" (bouton "Configurer un
domaine" ou nom du domaine + ✓/« en attente »), `FormulaireDomaine.tsx`
(modale, même patron que `FormulairePaiement.tsx`) — bascule entre "ajouter"
et "vérifier/retirer" selon que l'hôtel a déjà un domaine, sans se fermer
entre les deux (l'hôtel affiché est recalculé par id depuis la liste à
jour, pas figé au moment de l'ouverture). Aucune instruction DNS précise
affichée : l'API publique Render ne les expose pas (seulement son
dashboard) — le Super-Admin s'y réfère directement une fois le domaine
ajouté.

**Vérifié** : 190/190 tests API (8 nouveaux `render-domains.service.spec.ts`,
12 nouveaux `super-admin.service.spec.ts`, cas `findFirst`/`OR` de
`public.service.spec.ts` mis à jour), 40/40 `api-client`, build racine
complet (10/10 paquets), `tsc --noEmit` propre sur `super-admin`/`mobile`.
Migration `20260928090000_domaines_personnalises` appliquée en base réelle
(`ALTER TABLE ADD COLUMN`, nullable, sans risque). Non-régression confirmée
en direct : `GET /public/chambres-disponibles?sousDomaine=chicago` toujours
200, `sousDomaine=inconnu` toujours 404.

**Hors scope de cette phase** : déploiement réel Render (Phase 8, toujours
pas fait — prérequis pour que `RENDER_WEB_SERVICE_ID` existe et que ce
chantier devienne testable en live), choix du domaine de base final de la
plateforme, instructions DNS affichées dans le panel, plusieurs domaines
par hôtel, vérification automatique périodique (cron).

## HotelSaver — Phase 14 : identité de l'application (logo, icônes, splash), 28/09/2026

Le patron a fourni le logo officiel de l'application (`badge bleu « H +
étoiles », 1024×1024, fond transparent` → `assets/icons/hotelsaver-icone.png`)
en précisant la règle désormais appliquée partout : **le logo de
l'application HotelSaver et celui de chaque hôtel sont deux choses
distinctes, chacune à sa place.**

**Règle de répartition** (conséquence directe de la multi-tenancy, Phases
1-13) : l'identité HotelSaver est un actif statique versionné
(`assets/icons/`), utilisée dans le chrome applicatif — icône Play Store,
splash, écran de connexion, en-têtes, favicons, panel Super-Admin. Le logo
d'un hôtel reste une donnée du tenant (`HotelBranding.logoUrl`, servie par
`GET /public/hotel`), affichée uniquement dans les contextes propres à cet
hôtel : bandeau des pages publiques du tenant (`apps/web`), nom d'hôtel dans
les heroes des tableaux de bord, titre des reçus imprimés. L'ancien
`logo-couleur.png` (monogramme doré-roux) est le logo **de l'hôtel Chicago**,
pas de l'application — il est conservé comme actif du tenant mais n'apparaît
plus dans le chrome générique.

**Mobile** : `app.json` renommé `HotelSaver` (slug/scheme `hotelsaver`),
`icon` + `adaptiveIcon` + `splash` régénérés depuis le maître. Le package
Android/iOS passe de `com.hotelchicago.app` à `com.hotelsaver.app` : changement
gratuit tant que rien n'a jamais été publié sur un store (l'applicationId
n'existait que sur l'appareil de test) — à verrouiller définitivement au
premier upload Play Console, il ne pourra plus changer ensuite. Le splash
natif (`splash.image` + `backgroundColor #053483`, navy relevé sur le bord
bas du badge) enchaîne sans couture sur l'écran `chargement` de `App.tsx`
(même logo, même fond) — effet « splash Facebook ». Suppression de
`monochromeImage` : le badge n'a pas de silhouette exploitable pour les
icônes thémées Android (son alpha = un carré arrondi plein) — prévoir la
variante « symbole seul » si besoin.

**Dérivés générés** (`assets/scripts/generer-icones-hotelsaver.cjs`, pngjs +
bilineaire, redocumenté dans `assets/README.md`) : avant-plan adaptatif =
artwork réduit à 62 % centré (zone sûre des masques Android) ; arrière-plan
= dégradé vertical prolongé du badge ligne par ligne (le squircle fond sans
couture quel que soit le masque) ; favicon 64 ; `icon.ico` = PNG 256
encapsulé (valide Vista+, suffisant tant qu'electron-builder n'est pas
configuré). Les placeholders de template Android Studio (chevron bleu) et
le `logo-couleur.png` dupliqué dans `apps/mobile/assets/` sont supprimés.

**Desktop** : `BrowserWindow.icon` (`resources/icon.png`, convention
electron-vite), `productName: HotelSaver`, logo dans la barre latérale et
le tiroir mobile (`Coquille`), écran de connexion rebrandé. **Web** :
favicon, logo dans la nav, page d'inscription. **Super-Admin** : favicon,
logo connexion + entête. Le titre des reçus (`HOTEL CHICAGO` dans
`receipts/` et les imprimantes) reste volontairement celui du tenant —
rendre le titre du reçu dynamique par hôtel est un chantier à part.

**Vérifié** : voir la vérification du commit — typecheck/build des quatre
applis concernées.

### 2026-09-27 — Élimination du flash noir au démarrage Android + écran de démarrage chorégraphié

**Constat mesuré sur l'OUKITEL (captures en rafale)** : splash natif →
~2-4 s de noir → écran JS. Diagnostic : `SplashScreenManager`
(expo-splash-screen) bloque **tout draw** de la fenêtre via un
`OnPreDrawListener` tant que `keepSplashScreenOnScreen` — pendant le
chargement/évaluation du bundle, aucune frame n'est produite et
SurfaceFlinger affiche une surface vide = noir. Ni `windowBackground` ni
`preventAutoHideAsync` ne peuvent rien : rien n'est dessiné. (Sur un appareil
Android < 12 l'effet est le même : la vue compat du splash ne peut pas se
dessiner pendant le blocage.)

**Solution** (`MainActivity.kt`, régénérée par le plugin
`apps/mobile/plugins/withSurfaceTranslucide.js` — `android/` est gitignoré) :

1. `SplashScreenManager.hide()` juste après `super.onCreate` → débloque le
   premier draw immédiatement.
2. Un **voile natif** (`ImageView` logo + fond navy `#053483`) est ajouté
   au-dessus de la `decorView` — il dessine dès la première frame, couvre
   toute l'attente (init ReactHost + téléchargement/évaluation du bundle,
   qui peut durer > 60 s en dev sur cet appareil).
3. Il est retiré en fondu quand `ReactMarkerConstants.CONTENT_APPEARED`
   signale le premier rendu JS réel (+ 250 ms de marge) — le premier écran
   JS (`EcranDemarrage`) est visuellement identique → transition invisible.

**Séquence JS** (`App.tsx`) : `EcranDemarrage` = logo seul → spinner en
fondu après 1,2 s → durée minimale 2,6 s avant toute transition
(`attendreDureeMinimale`) → dashboard direct si la session se rafraîchit,
sinon sélection de profil/connexion. `SplashScreen.preventAutoHideAsync()`
dans `index.ts` reste en place (cohérence du mécanisme expo).

**En mode release** le bundle est embarqué : le voile couvre ~1 s d'éval JS
au lieu du téléchargement — même rendu sans noir.

**Note Windows** : `gradlew assembleRelease` est bloqué sur ce poste par la
limite MAX_PATH de ninja (chemins d'objets ~380 chars via le store pnpm +
ninja sans manifest `longPathAware`). Utiliser un build cloud (EAS) ou une
machine avec chemins longs pour l'APK de production.

### 2026-09-28 — Élimination du « logo fantôme » au démarrage Android

**Constat mesuré sur l'OUKITEL (captures en rafale)** : après le fix du
flash noir (entrée précédente), un second défaut restait visible pendant
~1,5 s au démarrage à froid : un logo plus grand (~288 dp) apparaissait en
fondu croisé par-dessus notre voile natif et l'écran JS `EcranDemarrage`
(tous deux à 171 dp) — un changement de taille perceptible, contraire à
l'objectif d'un démarrage « façon Facebook » à taille constante.

**Diagnostic** : la **Starting Window** système (l'aperçu qu'Android
dessine seul, à partir du thème de l'Activity, *avant même* que
`MainActivity.onCreate()` ne s'exécute) affiche l'icône de
`Theme.App.SplashScreen` à une taille fixe calculée en interne par l'OS
(~288 dp) — ni `androidx.core:core-splashscreen` ni `Theme.SplashScreen`
(API 31+) n'exposent d'attribut de thème pour la configurer (contrairement
à `splashScreenIconSize`, qui avait été tenté et n'existe pas). Le fantôme,
c'est cette Starting Window elle-même, distincte de notre voile.

**Solution testée et écartée** : ajouter `android:windowDisablePreview` à
`Theme.App.SplashScreen` depuis un plugin de config Expo
(`withAndroidStyles` ou `withDangerousMod`, dans
`apps/mobile/plugins/withSurfaceTranslucide.js`). Vérifié par instrumentation
directe (`console.log` dans le mod, capture du fichier généré) : quelle que
soit la position de ce plugin dans `app.json` (`plugins`), le mod
`expo-splash-screen` qui reconstruit `Theme.App.SplashScreen` (4 items :
`windowSplashScreenBackground`, `windowSplashScreenAnimatedIcon`,
`postSplashScreenTheme`, `windowSplashScreenBehavior`) s'exécute à une étape
fixe et plus tardive de `expo prebuild`, indépendante de l'ordre du tableau
`plugins` — tout ce qu'un autre plugin y ajoute (via mod « safe » ou
« dangerous ») est systématiquement écrasé.

**Solution retenue** : patcher le fichier généré directement, une fois
`expo prebuild` terminé — `apps/mobile/scripts/patch-native-splash.js`
(nouveau), qui insère `<item name="android:windowDisablePreview">true</item>`
dans `Theme.App.SplashScreen` au sein de `styles.xml`, de façon idempotente.
Câblé dans `apps/mobile/package.json` (`"prebuild": "expo prebuild && node
scripts/patch-native-splash.js"`) pour rester automatique à chaque
régénération de `android/` (gitignoré), dans le même esprit que le plugin.
Sans Starting Window système, la première chose dessinée à l'écran devient
directement notre voile natif (`ajouterVoileDemarrage`, 171 dp, posé de
façon synchrone en tout début d'`onCreate()`) — une seule taille du début à
la fin.

**Alignement secondaire** : `imageWidth` de la config `expo-splash-screen`
(`app.json`) passé de `220` à `171`, pour que `R.drawable.splashscreen_logo`
(référencé directement par le voile natif) corresponde à la taille utilisée
partout ailleurs.

**Vérifié** : captures en rafale sur l'OUKITEL après rebuild — plus de
phase à taille différente, fondu croisé entre deux logos de même taille
(imperceptible), spinner apparaît normalement, transition vers l'écran de
sélection de profil ou le dashboard inchangée.

### 2026-09-28 — Refonte du démarrage mobile en deux écrans explicites

Le patron a rejeté la tentative précédente (une seule vue « logo puis spinner
en fondu ») : le résultat réel divergeait de ce qui avait été demandé, malgré
une annonce de succès prématurée. Consigne explicite, sans ambiguïté :
**deux écrans distincts**, pas de tour de passe-passe visuel.

`apps/mobile/App.tsx` — `EcranDemarrage` remplacé par deux composants :

1. `EcranAccueil` : logo en grande taille (220 dp, même taille que le voile
   natif — transition invisible) + slogan (« La gestion complète de votre
   hôtel, simplifiée. »). Affiché pendant `DUREE_ACCUEIL_MS` (1,5 s) fixe,
   indépendamment du temps de chargement réel.
2. `EcranChargement` : logo réduit (140 dp) + `ActivityIndicator` + texte
   « Veuillez patienter… ». Affiché ensuite, pendant la vérification réelle
   (config, profils, rafraîchissement de session) — pas de durée minimale
   artificielle, juste le temps que ça prend.

Le `useEffect` de démarrage est redevenu strictement séquentiel : attendre
`DUREE_ACCUEIL_MS`, passer à `"chargement"`, puis faire le travail réel
(l'ancien `attendreDureeMinimale()` par branche est supprimé — un seul délai
fixe au début suffit). Le voile natif (`withSurfaceTranslucide.js`) est
passé de 171 dp à 220 dp pour rester assorti à `EcranAccueil`, qui est
maintenant le premier écran JS rendu (et non plus l'écran de chargement) :
`SplashScreen.hideAsync()` est donc appelé depuis son `onLayout`.

**Vérifié** : captures en rafale sur l'OUKITEL, deux démarrages à froid
consécutifs — logo seul (voile natif) → logo + slogan (JS) → logo réduit +
spinner + « Veuillez patienter… » → sélection de profil, sans écran noir ni
changement de taille intermédiaire.

**Correction du même jour** : le voile natif n'affichait que le logo (pas de
texte) — la brève fenêtre entre son apparition et le premier rendu JS
(`EcranAccueil`, avec le slogan) était perçue par le patron comme un écran
supplémentaire distinct (« deux interfaces ajoutées sur les deux d'avant »).
Première tentative : ajouter le même slogan au voile natif (`LinearLayout`
logo + `TextView`), pour que les deux rendus soient identiques dès la
première frame — insuffisant : même à contenu pixel-identique, deux moteurs
de rendu indépendants (Kotlin puis React) affichant successivement « le même
écran » restent perçus comme une répétition (« le logo apparaît deux fois »).

**Solution retenue** : `EcranAccueil` est supprimé côté JS — le voile natif
est désormais le SEUL rendu du premier écran (logo + slogan), affiché au
minimum 1500 ms au total (calculé depuis `ajouterVoileDemarrage`, pas
seulement jusqu'à `CONTENT_APPEARED`). `App.tsx` passe directement à son
écran de chargement (logo réduit + spinner + « Veuillez patienter… »), un
contenu visuellement différent, donc jamais confondu avec une répétition.

Effet de bord corrigé au passage : le minimum d'affichage du second écran
(`DUREE_MINIMALE_CHARGEMENT_MS`) se comptait depuis le montage JS — à peu
près le même instant que le début du voile natif. Avec une session déjà
valide (vérification quasi instantanée), le JS traversait tout l'écran de
chargement PENDANT qu'il était encore caché sous le voile, qui ne se
retirait qu'ensuite — révélant le tableau de bord directement, sans jamais
montrer le spinner. Remonté à 2500 ms (couvre les ~1500 ms du voile plus une
marge visible), pour que l'écran de chargement reste réellement vu après la
levée du voile, quelle que soit la rapidité de la vérification réelle.

**Correction du même jour (2) — fond bleu nu entre deux écrans** : signalé à
deux endroits distincts de la séquence (juste après le voile, et juste avant
le tableau de bord). Cause commune : `ecran === "chargement"` et
`ecran === "application"` étaient deux `return` séparés au sommet du
composant — passer de l'un à l'autre force React à démonter tout l'arbre
affiché pour en monter un tout nouveau (pour "application" : navigation +
onglets + écrans, un montage coûteux), laissant voir le fond bleu de la
fenêtre le temps que ce nouvel arbre peigne sa première image, même avec une
surimpression placée À L'INTÉRIEUR de ce nouvel arbre (elle subit le même
retard que ses voisins). Les deux états partagent désormais un seul arbre
racine stable ; l'écran de chargement y est une simple bascule de visibilité
(`applicationPrete`), jamais démonté/remonté pendant la transition.

Piège au passage : la remise à `false` de `applicationPrete` se faisait dans
un `useEffect` déclenché par le changement de `client` — un `useEffect` ne
s'exécute qu'*après* le rendu, donc au premier rendu où `client` devient
non-nul (le tableau de bord commence à monter), `applicationPrete` valait
encore sa valeur précédente (`true`, mis par le passage précédent dans
l'écran de chargement) : ce tout premier rendu se faisait donc sans
surimpression. Remplacé par une remise à zéro synchrone pendant le rendu
lui-même (comparaison avec un `useRef`, pattern recommandé par React pour
« réinitialiser un état quand une prop change »).

**Mesure de la marge nécessaire** : instrumentation temporaire
(`Log`/`console.log` horodatés + captures d'écran avec timestamp système
précis, pas seulement un numéro de frame) sur l'OUKITEL. Résultat : le délai
entre `CONTENT_APPEARED` (le voile natif ne fait que réagir à ce signal) et
l'apparition réelle du contenu varie énormément d'un démarrage à l'autre —
observé entre ~0,45 s et plusieurs secondes après une dizaine de cycles
reconstruction/relance consécutifs pendant cette session de débogage,
symptôme cohérent d'un appareil d'entrée de gamme sous forte charge
(mémoire, cache) plutôt que d'un défaut de code à ce stade. La marge a été
portée à 600 ms par prudence, mais aucune constante fixe ne peut garantir
l'absence totale de ce fond bleu sur un appareil déjà très sollicité — un
nouveau test après redémarrage du téléphone est nécessaire pour confirmer le
comportement en conditions normales.

**Correction à la relecture (même jour, avant commit)** : la surimpression
`{!applicationPrete && <EcranChargement onPret=…/>}` se détruisait
elle-même pendant la phase `"chargement"` : `onPret` se déclenchait ~430 ms
après son montage → `applicationPrete = true` → démontage, alors que
`ecran` reste `"chargement"` jusqu'à `DUREE_MINIMALE_CHARGEMENT_MS`
(2500 ms) — ~2 s de fond navy nu, sans logo ni spinner, à chaque démarrage.
Fix : la surimpression n'a pas de `onPret` pendant `"chargement"` et ne
devient relevable qu'une fois le contenu applicatif monté (`contenuPret` =
`ecran === "application"` && client && utilisateur && moteurSync) ; la
`key` de la surimpression bascule alors, la remontant pour que
`onLayout` → `onPret` se redéclenche et lève le voile ~430 ms plus tard —
ce qui couvre aussi l'attente asynchrone de `moteurSync` (ouverture
SQLite), que l'ancienne condition `{!applicationPrete}` laissait nue si
l'ouverture dépassait 430 ms.

**Rectificatif tailles** : le paragraphe « Alignement secondaire » plus
haut (écrit avant la refonte en deux écrans) dit `imageWidth` passé de 220
à 171 — l'état final est `imageWidth: 220` dans `app.json`, cohérent avec
le voile natif remonté à 220 dp ; seul l'écran JS de chargement est plus
petit (140 dp), volontairement.

### 2026-09-28 — Bascule hot-reload conditionnelle (`HOT_RELOAD=1`)

Le bundle-embarqué (`debuggableVariants = []` + `useDevSupport = false`,
injectés par `withSurfaceTranslucide.js`) rend chaque itération JS coûteuse
(~1-13 min de rebuild). Pour le développement, le plugin saute désormais
ces deux injections quand `HOT_RELOAD=1` est présent au moment de
`expo prebuild` : le build debug recharge son bundle depuis Metro (fast
refresh) au lieu de l'embarquer. Usage : `HOT_RELOAD=1 pnpm --filter mobile
prebuild`, rebuild `gradlew installDebug`, puis `pnpm --filter mobile dev
--port 8081` avec `adb reverse tcp:8081`. Le voile natif couvre le
téléchargement du bundle au démarrage comme prévu (barre « Bundling » de
Metro visible dessous). Vérifié sur l'OUKITEL : bundle servi en ~54 s puis
tableau de bord, session restaurée silencieusement.

## HotelSaver — Phase 15 : gestion des comptes utilisateurs + rattrapage Cafétaria desktop, 28/09/2026

Jusqu'ici, créer un compte employé (Réceptionniste/Cafétaria) nécessitait le
script CLI `packages/database/scripts/creer-utilisateur.js` — aucun écran ne
permettait au patron de le faire lui-même. Mobile avait déjà les 4 écrans
Cafétaria (Caisse, Comptes ouverts, détail compte, Stock/Menu) opérationnels
avec synchronisation hors ligne ; desktop n'en avait aucun (`disponible:
false` partout dans `navigation.ts`). Cette phase ferme les deux manques
pour que « le patron crée le compte, l'employé se connecte sur téléphone ou
desktop et tombe directement sur son interface » fonctionne de bout en bout.

**Schéma** : `Utilisateur.email` ajouté (`String? @unique`, migration
`20260928130000_ajout_email_utilisateur`, appliquée via
`migrate:appliquer` — le pooler transaction ne supporte pas `prisma migrate
dev`, voir AGENTS.md). Nullable : les comptes déjà créés par le script CLI
avant cette phase n'ont pas de valeur tant qu'ils ne sont pas mis à jour à
la main. `creer-utilisateur.js` écrit désormais ce champ pour les nouveaux
comptes créés en ligne de commande.

**API — `UtilisateursModule`** (`GET/POST /utilisateurs`,
`PATCH /utilisateurs/:id`, PATRON uniquement, scopé `hotelId` comme tous les
modules depuis la Phase 2) : réutilise `SupabaseAdminService.creerCompte`
(déjà servant à `PublicService.inscrireHotel`) avec `emailConfirme: true`
(un compte posé par un patron de confiance, pas une inscription
libre-service — pas d'email à confirmer) et le même rollback du compte
Supabase si l'écriture Prisma échoue (email déjà pris → 409, pas 500). Seul
`actif` est modifiable pour l'instant (activer/désactiver) — `actif = false`
est déjà bloqué à la connexion par `SupabaseAuthGuard`, donc immédiatement
effectif ; désactiver son propre compte est refusé explicitement (400)
plutôt que de se retrouver bloqué dehors sans recours.

**Clients** : `ClientApi.listerUtilisateurs/creerUtilisateur/
changerStatutUtilisateur` (api-client), puis un écran « Utilisateurs »
quasi identique mobile (`EcranPlus` → Administration, déjà réservé) et
desktop (`EcranParametres` → Administration, bouton « Gérer » remplaçant le
badge « Bientôt »). Le mot de passe est choisi par le patron dans le
formulaire et communiqué directement à l'employé — pas de génération
automatique ni d'email d'invitation (décision explicite : plus simple pour
un patron qui voit son employé en personne).

**Rattrapage Cafétaria desktop** (Caisse, Comptes ouverts, détail compte,
Menu, Stock — `apps/desktop/src/renderer/src/screens/`) : même logique
métier que les écrans mobile équivalents, mais **sans miroir hors ligne** —
desktop appelle `ClientApi` directement partout (poste fixe, cohérent avec
`EcranChambres`/`EcranFacturation`, seuls écrans desktop existants). Le
détail d'un compte (`EcranCompteCafeteria`) est accessible aussi bien
depuis « Caisse » (après ouverture) que depuis « Comptes ouverts » (en
cliquant une ligne) : un état `compteCafeteriaOuvert` levé dans `App.tsx`
bascule l'affichage de la page active entre formulaire/liste et détail,
réinitialisé à chaque navigation explicite (sidebar, tableau de bord) pour
ne jamais montrer un détail périmé en revenant sur l'une des deux pages.
Impression du reçu de vente : même mécanisme que `EcranFacturation`
(`window.hotelChicago.imprimer` + `construireRecuVente`, déjà agnostique du
type de compte — mobile ou desktop). `navigation.ts` desktop passe les 4
entrées Cafétaria à `disponible: true`.

**Hors scope de cette phase** (confirmé avec le patron) : interface
Réception au-delà de l'existant (Chambres/Facturation) — passe séparée à
venir ; répartition par personne/part égale à l'encaissement (déjà « à
venir » côté mobile, inchangé) ; réinitialisation de mot de passe.

**Vérifié** : 198/198 tests API (dont `utilisateurs.service.spec.ts`,
nouveau), suite api-client (43 tests, `client.spec.ts` étendu),
`tsc --noEmit` mobile propre, build desktop (`electron-vite build`) et
`tsc --noEmit` desktop sans nouvelle erreur (les deux erreurs restantes
dans `navigateur-secours.ts` sont préexistantes, sans rapport avec cette
phase). Test de bout en bout restant à faire par le patron : créer un
compte CAFETARIA via les deux apps, se reconnecter avec, confirmer
l'atterrissage sur l'interface Cafétaria (mobile et desktop).

---

## 28/09/2026 — Phase 16 : module Réception complet (mobile + desktop)

**Portée** : tout le circuit d'une réception hôtelière, sur les deux apps,
avec hors-ligne mobile pour la consultation et la création/modification de
réservations (option « hors-ligne complet » choisie par le patron).

### API

- `POST /reservations/:id/confirmer` : les demandes `EN_ATTENTE` venues du
  site public peuvent enfin être validées — le contrôle de chevauchement se
  fait ici (une demande en attente ne bloque pas la chambre, voir
  `STATUTS_OCCUPANTS` dans `reservations.service.ts`).
- `GET /clients` et `GET /clients/:id` : chaque client renvoyé avec son
  historique de séjours embarqué (`ClientAvecSejours`).
- `GET /taux-change/actuel`, `GET /taux-change`, `POST /taux-change`
  (PATRON) : le paiement croisé (section 9.4) n'était jusque-là pas
  utilisable faute d'endpoint pour définir le taux.
- `Client` devient synchronisable : migration ajoutant `updatedAt` +
  `syncVersion`, ajout au pull `/sync/pull`, et mapping `clientLocalId →
  remoteId` côté `sync.service.ts` pour les réservations créées hors ligne
  avec un client inline (le client naît avec sa réservation au push).

### Hors-ligne mobile — bornes documentées

- **Hors-ligne** : consultation (réservations, clients, chambres),
  création de réservation (client nouveau ou existant synchronisé) et
  modification dates/acompte via la file de sync générique — miroir SQLite
  `reservations` + `clients` (`stockage/reservationsMirroir.ts`, pattern
  id local stable + `remoteId` comme `cafeteriaMirroir.ts`).
- **En ligne seulement** : confirmer, check-in, check-out, annuler,
  facturer — transitions transactionnelles multi-entités hors de la file
  générique (même borne que l'encaissement cafétaria). L'UI grise ces
  actions hors ligne et pour une réservation sans `remoteId` (« en attente
  de synchro »). Après une action en ligne réussie, le miroir est écrit
  localement tout de suite (`ecrireStatutReservationLocal`) puis
  réconcilié par le pull suivant.
- Un client créé hors ligne ne peut pas être référencé par une autre
  réservation tant qu'il n'a pas de `remoteId` (le push échouerait) : le
  formulaire n'offre « client existant » que pour les clients synchronisés,
  ou « nouveau client » inline.
- Check-in immédiat (« le client est déjà là ») : en ligne uniquement,
  appel direct `creerReservation` + `checkIn` — la file ne donnerait
  l'`remoteId` qu'au prochain push, trop tard pour enchaîner le check-in.
- `StockageLocal.confirmerPush` accepte désormais `EntitePull` (les
  mappings enfants peuvent concerner `Client`, pullable mais non poussable).

### Paiement croisé (9.4) — mobile et desktop

Les écrans de facturation affichent : devise remise (USD/CDF), montant
remis, devise du rendu, et la monnaie à rendre prévisualisée — même calcul
que `encaissement.util.ts` (le serveur fait foi). Borne inchangée : une
facture mixte (chambre + cafétaria en devises différentes) refuse le
croisé ; l'UI le signale au lieu de tenter l'envoi. Le taux saisi par le
patron est lu via `GET /taux-change/actuel` au chargement.

### Écrans

- **Mobile** : onglet « Réserv. » = hub à 4 segments (Aujourd'hui /
  À venir / En cours / Historique) lisant le miroir ; `EcranNouvelleReservation`
  (dates JJ/MM/AAAA + stepper nuits, chambre grisée si occupée sur la
  période — même règle que `verifierAbsenceDeConflit`, client nouveau/
  existant, acompte, aperçu total) ; `EcranReservationDetail` (actions
  contextuelles selon statut + connectivité) ; `EcranClients` et
  `EcranTauxChange` dans « Plus » ; gestion des chambres PATRON dans
  `EcranChambres` (« + », modifier, supprimer — en ligne, suppression
  retirée du miroir à la main car le pull n'a pas de tombstone).
- **Desktop** : `EcranReservations` (tableau filtrable + détail +
  création), `EcranArriveesDeparts` (arrivées/départs du jour + clients
  présents, actions directes), `EcranClients`, gestion des chambres
  PATRON dans `EcranChambres` (+ colonne client occupant), journal des
  reçus dans `EcranFacturation` (réimpression pour tous à la réception,
  annulation PATRON avec motif), taux de change dans Paramètres >
  Administration, deep-link « Facturer » vers le détail d'encaissement
  (`reservationAFacturer` dans `App.tsx`, même pattern que
  `compteCafeteriaOuvert`).

**Vérifié** : 206/206 tests API (l'e2e `roles` exige un `beforeAll` à
temps — relancer la suite seule sous charge parallèle), 43 tests
api-client, tests + build sync-engine, `tsc --noEmit` mobile et desktop
propres, `electron-vite build` OK, migration `client_updated_syncversion`
appliquée et vérifiée.

---

## 28/09/2026 — Phase 16 (suite) : comptes de rôle uniques + rotation des identifiants

Deux règles demandées par le patron, liées :

- **Un seul compte par rôle par hôtel** (`UtilisateursService.create` :
  `count({ hotelId, role })` avant tout appel Supabase, sans filtre `actif`
  — un compte désactivé se réactive, il ne se remplace pas). Message 409
  explicite : « Cet hôtel a déjà un compte <Rôle>. Un seul compte par rôle
  est autorisé — modifiez le compte existant… ». Conséquence assumée : pas
  de traçabilité par personne — le compte de rôle est partagé, audit au
  niveau du compte seulement.
- **Modification des comptes** (`PATCH /utilisateurs/:id`, PATRON) : nom,
  email, mot de passe et actif tous optionnels (au moins un requis).
  Email/mot de passe passent par `SupabaseAdminService.mettreAJourCompte`
  (PUT admin, `email_confirm: true` pour un effet immédiat) AVANT l'écriture
  Prisma ; si Prisma refuse ensuite (P2002, email déjà pris), on tente de
  remettre l'ancien email — le mot de passe n'est pas réversible. Seule la
  désactivation de son propre compte reste bloquée ; se renommer ou changer
  son propre email/mot de passe est permis.

C'est le canal de **rotation d'équipe** : quand un employé part, le patron
modifie le compte du rôle (nouveau nom/email/mot de passe) au lieu d'en
créer un autre — l'ancien employé n'a alors plus d'identifiants valides.
Mobile et desktop : bouton « Modifier » par compte + sélecteur de rôle qui
grise les rôles déjà dotés (« · déjà créé ») à la création.

**Vérifié** : 13/13 tests `utilisateurs.service.spec.ts` (garde par rôle,
update Supabase→Prisma, rollback email P2002), api-client étendu
(`modifierUtilisateur`, `DonneesModificationUtilisateur`), typechecks
mobile et desktop propres.

### Correctif — GET /cafeteria/ventes et rôle RECEPTIONNISTE

Bug trouvé au premier test réel de facturation : l'écran « Facturer et
check-out » appelait `GET /cafeteria/ventes?reservationLieeId=…` pour
l'aperçu du total (chambre + cafétaria), or la route n'acceptait que
CAFETARIA/PATRON → 403 « accès refusé » avant même la création de la
facture. La réception peut désormais lire **uniquement** les ventes liées
à un séjour (`reservationLieeId` obligatoire pour ce rôle, sinon 403) —
la matrice « pas d'accès au module cafétaria » reste intacte ailleurs.

### Suite — journal des reçus des deux côtés

Retour terrain du patron : après impression d'un reçu, aucun historique ne
permettait de revoir le détail du paiement ou de réimprimer. Ajout :

- **Mobile** : nouvel écran `EcranJournalRecus` (Plus > Journal des reçus,
  tous rôles). Segments par rôle — PATRON : Séjours + Cafétaria,
  RECEPTIONNISTE : Séjours, CAFETARIA : Cafétaria. Chaque pièce affiche le
  détail complet du règlement (montant remis, devise, taux appliqué, monnaie
  rendue, dates d'encaissement/impression/annulation) + réimpression
  Bluetooth + annulation avec motif (PATRON uniquement). En ligne
  uniquement — les reçus ne sont pas mirrorés dans SQLite (la réimpression
  hors ligne n'a pas de valeur métier demandée).
- **Desktop** : réception — bouton « Détail » ajouté au journal des reçus
  existant (EcranFacturation) ; cafétaria — `JournalVentes` ajouté sous les
  comptes ouverts (même détail, réimpression, annulation patron).

### Sécurité — sélection de profil et déconnexion (retour terrain)

Deux trous du mode « téléphone partagé » (section 5) corrigés :

- Un profil choisi dans `EcranSelectionProfil` repassait par le jeton de
  rafraîchissement mémorisé, mot de passe jamais redemandé — un employé
  pouvait ouvrir la session **PATRON** depuis son propre téléphone.
  Désormais, choisir une carte Patron force la saisie du mot de passe
  (email pré-rempli) même si un jeton existe. Les bascules entre comptes
  employés restent rapides — le trou qu'elles ouvrent est limité à des
  privilèges de même niveau.
- « Changer de profil » dans Plus n'est plus montré qu'au PATRON. Les
  employés ont « Se déconnecter » (rouge), qui oublie le profil ET son
  jeton (`oublierProfil`) — la reconnexion exige le mot de passe, il n'y a
  plus de porte dérobée par la liste des profils.

### Durcissement complet — chacun garde son compte

Le patron a tranché : pas de basculement entre comptes employés du tout.
`choisirProfil` ne repasse plus par le jeton mémorisé pour PERSONNE —
chaque carte de profil redemande le mot de passe. Le patron « circule »
parce qu'il connaît les identifiants qu'il a créés dans Utilisateurs, pas
grâce à un raccourci sans authentification. De même, la reconnexion
silencieuse au démarrage saute désormais un dernier profil PATRON : un
redémarrage de l'app sur un téléphone partagé ne doit pas rouvrir la
session patron sans mot de passe (les profils employés, eux, reprennent
leur session — continuité sur leur propre compte, pas de changement).

### UX — refonte de l'onglet « Plus » mobile

Retour du patron : la liste empilait déconnexion, réglages et modules sans
hiérarchie — « pas une app professionnelle ». Nouvel ordre, calqué sur la
barre latérale desktop : carte profil → sections métier (icône + libellé +
chevron, mêmes icônes que `ICONES` de Coquille.tsx) → section « Appareil »
(Paramètres, Imprimante, Synchronisation) → action de compte en bas
(Changer de profil PATRON / Se déconnecter rouge employés). La carte
« Compte » existe aussi en bas de Paramètres mobile — deux endroits
évidents plutôt qu'un.

### UX — correctifs terrain du 29/09 (suite au premier test complet)

Retour du patron après un vrai passage sur le téléphone, quatre sujets :

1. **Clavier** : `adjustResize` du manifeste est inerte parce que
   `edgeToEdgeEnabled=true` (gradle.properties) — la fenêtre ne
   redimensionne plus, le clavier recouvrait tous les champs du bas
   (login compris, qui n'avait même pas de ScrollView). Un seul
   composant partagé `ConteneurFormulaire` (KeyboardAvoidingView
   `behavior="height"` sur Android + ScrollView persistTaps) enveloppe
   désormais tous les écrans-formulaires ; `FeuilleModale` a le même
   comportement (une Modal RN ne profite pas de l'activité parente). Le
   formulaire remonte au focus, défile, revient en place à la fermeture.
2. **Déconnexion** : confirmation `Alert` (« Annuler » / « Se
   déconnecter » en rouge) avant de couper la session ; l'action vit
   uniquement dans Paramètres → carte Compte (retirée du bas de Plus où
   elle apparaissait en double).
3. **Boutons « + »** : déplacés de l'en-tête vers un FAB bas-droite
   (`BoutonAjouterFlottant`) — standard Android, sous le pouce — sur
   Réservations, Chambres, Utilisateurs, Menu, Stock ; +88px de marge
   basse sur les listes pour ne pas recouvrir la dernière carte.
4. **« Retour »** : zone tactile ≥44px partout (`EnteteRetour` et le
   retour embarqué d'EcranReservations, jugé trop petit).
5. **Paramètres** : « Tester la connexion » supprimé (le statut de
   connexion du bandeau EnteteMobile suffit).

## 30/09/2026 — Site web : landing page professionnelle animée

`apps/web` : `/` devient une vraie vitrine HotelSaver, le formulaire
d'inscription est sur `/inscription`. Sections : barre collante (burger
mobile), hero avec maquette de téléphone en CSS, chiffres animés, six
fonctionnalités, trois blocs détaillés (réception, cafétaria, hors ligne),
étapes, **hôtels partenaires**, tarifs, FAQ, appel final, pied de page. Tout
le contenu éditorial (textes, prix, FAQ) est dans `src/accueil/donnees.ts`.

- **Framer Motion** introduit (seule nouvelle dépendance de `apps/web`) :
  apparitions au défilement, compteurs, parallaxe, accordéon. Tout est
  désactivé si `prefers-reduced-motion` (hook `useReducedMotion` + media
  query CSS). Maquettes en CSS/SVG, aucune image lourde.
- **Hôtels partenaires** : `GET /public/hotels-partenaires` (sans guard,
  comme le reste de `/public`) ne renvoie que les hôtels `ACTIF` (abonnement
  payé) et des champs minimaux — nom, sous-domaine, logo, adresse, couleur de
  marque, jamais de contact ni de données de licence. Choix assumé : pas
  d'opt-in explicite (aucune migration) ; un hôtel `ESSAI` n'apparaît pas. Si
  un hôtel refuse d'être montré, il faudra ajouter un champ « visible sur la
  vitrine ». Liste vide ou API injoignable → repli « Soyez parmi les
  premiers », jamais d'erreur affichée. Les cartes pointent vers
  `/chambres?hotel=<sousDomaine>` (le domaine de base de production n'est
  toujours pas choisi).
- **Tarifs = placeholders à valider** : Essentiel 29 $, Pro 59 $, Premium
  99 $ par mois, et leurs périmètres (nombre de chambres, domaine
  personnalisé…), sont indicatifs. Aucune limite de chambres n'est appliquée
  par l'API : ces limites ne sont que du texte marketing tant qu'elles ne
  sont pas implémentées.
- Français seulement. `BarreMarketing` sur `/` et `/inscription`,
  `BarreNavigation` d'origine sur les pages d'un hôtel.

**Hors scope** : vraies captures d'écran, témoignages, SEO avancé
(sitemap, rendu serveur), version anglaise, thème sombre.

## 01/10/2026 — Refonte connexion / inscription (web, desktop, mobile)

Suite à la maquette fournie par le patron : même langage visuel partout.

- **Web** (`/inscription`) et **desktop** (connexion) : fond pleine page, carte
  **centrée au milieu de l'écran** (correction du 01/10 après relecture de la
  maquette : pas de colonnes séparées), photo qui se fond dans la page (à
  droite sur le web, à gauche sur le desktop). Photo
  d'une chambre bleue et blanche (Unsplash, libre d'usage, embarquée
  en local : `apps/web/public/hotel-chambre-bleue.jpg` et
  `apps/desktop/src/renderer/src/assets/`) avec voile navy et trois arguments,
  carte blanche à droite. Sous 960 px (web) / 900 px (desktop) le panneau photo
  disparaît. Champs avec icône, coche de validation, œil sur les mots de passe
  (`lucide-react`, ajouté à `apps/web`, déjà utilisé par le desktop). Le
  sous-domaine se propose tout seul depuis le nom de l'hôtel tant qu'on n'y a pas
  touché. Les libellés `Email` / `Mot de passe` et le titre `HotelSaver` sont
  conservés pour les tests e2e desktop (le bouton œil ne contient donc pas
  « mot de passe » dans son `aria-label`).
- **Mobile** : bandeau navy (logo + nom) sous la barre d'état, feuille blanche
  aux coins arrondis, stepper 1–2 à l'inscription (`EnteteAuth`, `ChampAuth`,
  `EtapesAuth` dans `src/composants/`). **La barre d'état est navy dans toute
  l'app** : `EnteteMobile` passe en navy avec texte/cloche blancs et
  `StatusBar style="light"` (App.tsx).
- **Non repris de la maquette, volontairement** : « Mot de passe oublié ? » et
  « Se souvenir de moi » (aucun des deux n'existe côté API/Supabase ; un lien
  mort serait pire que rien), « Se connecter » sur le site web (le web n'a
  pas de session par décision Phase 8 : le personnel se connecte depuis
  mobile/desktop), inscription sur desktop (elle se fait sur web/mobile).
- Le suffixe `.hotelsaver.com` du sous-domaine vient de la maquette ; le domaine
  de base de production n'est toujours pas choisi (voir Phase 9).

### Après l'inscription web : l'application est obligatoire (01/10/2026)

Décision du patron : une fois l'hôtel créé, le propriétaire doit installer
l'application pour se connecter et créer les comptes de son équipe (réception,
cafétaria) — le web n'ouvre aucune session. `EcranSucces` devient un parcours
en trois points (confirmer l'e-mail, installer l'app, créer les comptes dans
« Plus › Utilisateurs ») avec deux boutons de téléchargement Android / Windows.
Les liens viennent de `VITE_URL_PLAY_STORE` / `VITE_URL_APP_STORE` / `VITE_URL_WINDOWS` (`apps/web/.env`, voir le 01/10 ci-dessous) ;
**aucun build n'est encore publié**, donc tant que ces variables sont vides les
boutons affichent « Lien bientôt disponible ». À renseigner dès qu'un APK et un
installateur Windows sont hébergés.

## 01/10/2026 — Photos de chambres + site public de chaque hôtel défini par le patron

Retour du patron : impossible d'ajouter des images aux chambres, alors que les
clients les voient sur le sous-domaine de l'hôtel ; et ce site doit être
professionnel et entièrement piloté depuis le compte du patron.

### Images (API)

- **`POST /media/images?usage=chambre|couverture|galerie`** (PATRON,
  multipart, champ `fichier`, 10 Mo max en entrée) et **`DELETE /media/images`**.
  Le serveur **redimensionne puis convertit en WebP qualité 80** (`sharp`, nouvelle
  dépendance de l'API) : chambre/galerie tiennent dans 1280×960, couverture dans
  1920×1080, jamais agrandies, métadonnées (GPS compris) retirées. Mesuré : une
  photo bruitée de 8,6 Mo devient ~250 Ko ; une vraie photo finit autour de
  60–150 Ko. C'est la réponse à « pas trop grandes, sans surcharger la base ».
- **Stockage : Supabase Storage**, un bucket public `hotel-media` créé par l'API
  au premier envoi (clé service_role, comme `SupabaseAdminService` pour Auth), un
  dossier par hôtel. Le bucket n'accepte que du WebP ≤ 2 Mo (filet de sécurité).
- **Une URL n'est acceptée que si elle pointe dans le dossier de l'hôtel**
  (`verifierUrlsHotel`) : sans ça, un patron pourrait afficher une image externe ou
  celle d'un autre hôtel en forgeant une requête. Vaut pour `Chambre.photos` et le
  site.
- **2 photos maximum par chambre** (`@ArrayMaxSize(2)`, décision du patron : ne pas
  surcharger la base) ; `photos: []` est désormais autorisé pour tout retirer
  (l'ancien `@ArrayNotEmpty` l'interdisait). La première photo sert de couverture.
  Galerie du site : 6 photos max.
- Nettoyage du stockage : `HotelSiteService` supprime les images retirées du site ;
  pour les chambres, ce sont les apps qui appellent `DELETE /media/images` après
  l'enregistrement (et à l'annulation pour les envois abandonnés) — évite d'ajouter
  le stockage au constructeur de `ChambresService`, aussi utilisé par la synchro.

### Contenu du site (API)

- Nouveau modèle **`HotelSite`** (migration `20261001090000_hotel_site`, appliquée) :
  slogan, présentation, couverture, galerie, services (JSON : icône/titre/
  description, 12 max), WhatsApp, horaires d'arrivée/départ, réception 24 h/24,
  lien de carte, réseaux sociaux (facebook, instagram, tiktok, youtube, x).
  Nom, adresse, téléphone, e-mail restent sur `Hotel`. **RLS activée sur la table**
  (le schéma public est exposé par PostgREST : sans RLS la clé anon pourrait la lire
  et l'écrire) — aucune policy, l'API passe par le rôle postgres.
- **`GET/PUT /hotel-site`** (PATRON) : coordonnées + contenu à plat.
  `GET /public/hotel` renvoie maintenant aussi ce contenu (public par nature).

### Site public de l'hôtel (`apps/web`)

- Un même site, deux visages : si l'adresse correspond à un hôtel (sous-domaine,
  domaine personnalisé ou `?hotel=`), `App.tsx` affiche **son** site ; sinon (ou si
  l'API répond 404, ex. le domaine de la vitrine HotelSaver) la vitrine HotelSaver.
  En mode `?hotel=`, `cheminHotel()` ajoute le paramètre à chaque lien.
- Accueil : hero plein écran avec la photo de couverture (zoom lent) et barre de
  recherche de dates, à-propos, aperçu des chambres avec photos, services (icônes),
  galerie avec lightbox, contact (téléphone, WhatsApp, e-mail, horaires, itinéraire,
  réseaux), pied de page. Chaque section disparaît si le patron ne l'a pas remplie ;
  un hôtel sans contenu garde un site correct (hero dégradé, chambres, contact).
  Couleurs = la palette de l'hôtel (variables `--hc-*`). Page Chambres : cartes avec
  mini-diaporama des 2 photos, dates pré-remplies depuis l'accueil.
- Les icônes de marques (Facebook, Instagram, YouTube) sont des SVG maison :
  `lucide-react` v1 ne les fournit plus.

### Côté patron

- **Desktop** : photos dans le formulaire de chambre ; nouvelle entrée « Mon hôtel ›
  Site de l'hôtel » (PATRON) — `EcranSiteHotel`.
- **Mobile** : photos dans le formulaire de chambre ; Plus › Administration › Site de
  l'hôtel. Nouvelle dépendance native **`expo-image-picker`** : **un nouveau build
  Android est nécessaire** (`pnpm --filter mobile android`). Compression JPEG
  à 0,7 sur l'appareil avant envoi.

### Vérifié

226/226 tests API (nouveaux : traitement d'image réel avec sharp, vérification des
URLs, `HotelSiteService`), 43 tests api-client, builds web et desktop, `tsc` mobile.
**Test réel authentifié** contre Supabase (jeton du patron d'un hôtel de test) :
upload, WebP 1280×914, 400 sur fichier invalide / usage invalide / 3e photo / URL
externe / horaire invalide, PUT du site puis lecture publique, suppression, 401 sans
jeton. Rendu vérifié par captures à 1440 px et 390 px.

### Reste à faire / limites

- L'UI mobile n'a pas été exécutée sur téléphone (pas de build) — seulement typée.
- L'hôtel `hotel-test` (contenu de démonstration + chambres T-101..103) garde
  des données de démo.
- Images envoyées puis abandonnées en quittant l'écran sans annuler : restent dans le
  stockage (rare, pas de ménage périodique).
- Pas de mode hors ligne pour ces écrans (configuration, en ligne uniquement).

## 01/10/2026 — Téléchargement de l'application (Play Store / App Store) + RLS

### Boutons de stores sur le site

- Nouvelle section **« Téléchargez notre application mobile »** sur l'accueil
  (`accueil/Stores.tsx` : badges Google Play / App Store, atouts, maquette de
  téléphone), lien « Application » dans la barre et le pied de page. Les mêmes
  badges servent sur l'écran de succès d'inscription (Windows reste un lien à part).
- **Les liens se règlent dans `apps/web/.env`** : `VITE_URL_PLAY_STORE`,
  `VITE_URL_APP_STORE`, `VITE_URL_WINDOWS` (modèle dans `.env.example`). Une fois
  renseignés et le site rebuildé, les badges deviennent de vrais liens (nouvel
  onglet) — vérifié en injectant des URLs dans un build. Tant qu'une variable est
  vide, le badge reste cliquable et affiche « Bientôt disponible sur … » au lieu de
  pointer vers une page vide. Variable remplacée : `VITE_URL_ANDROID` n'existe plus.

### Sécurité — RLS manquante (corrigée)

Constat vérifié avec la clé `anon` (publique, embarquée dans les apps) : les tables
`Hotel`, `HotelBranding`, `PaiementLicence`, `SuperAdmin` et `_prisma_migrations`
n'avaient **aucune RLS** et les droits complets d'`anon` sur le schéma exposé par
PostgREST — n'importe qui pouvait les **lire, modifier et supprimer** (comptes
Super-Admin et paiements de licence compris). Migration
`20261001100000_rls_tables_sensibles` : RLS activée sans policy. L'API n'est pas
touchée (rôle `postgres`, `rolbypassrls = true`). Avant/après : `anon` lisait 7/7/1/1/11
lignes, il en lit 0 ; `/public/hotel` et `/public/hotels-partenaires` répondent
toujours. `SuperAdmin` et `_prisma_migrations` ajoutées au périmètre demandé
(mêmes défaut et même correctif).

### Sécurité — plus aucun accès direct pour `anon` (01/10/2026, suite)

Les policies `… OR auth.role() = 'anon'` de `rls-policies.sql` (conçues quand le site
public devait interroger Supabase directement) ne servaient plus depuis que tout passe
par `/public/*`. Migration `20261001110000_retirer_acces_anon` : `Chambre`, `Produit` et
`TauxChange` ne sont plus lisibles par `anon` (les chambres, le stock des produits et
le taux de tous les hôtels étaient exposés) ; `client_insert` ne l'autorise plus, et la
policy `reservation_insert_public` est supprimée — elle laissait n'importe qui insérer
un client ou une réservation **en contournant les contrôles de l'API** (disponibilité,
hôtel résolu). `rls-policies.sql` mis à jour pour rester la référence.

Vérifié avec la clé `anon` : 0 ligne lisible sur les 18 tables ; INSERT `Client` et
`Reservation` refusés (42501) ; UPDATE `Hotel` sans effet (0 ligne) ; aucune ligne
parasite en base ; `/public/hotel`, `/public/chambres-disponibles` et `/public/menu`
répondent toujours 200 (l'API passe par le rôle `postgres`, hors RLS).

### CORS : les sites d'hôtels (sous-domaines et domaines personnalisés) — 01/10/2026

Trouvé en testant `hotel-test.localhost:5175` dans un vrai navigateur : le site affichait
la vitrine HotelSaver au lieu de l'hôtel, car la liste `CORS_ORIGIN` n'autorisait que
`localhost:<port>` et le navigateur bloquait l'appel à `/public/hotel` (le site retombait
alors, par conception, sur la vitrine). **En production le même défaut aurait bloqué
chaque `x.hotelsaver.com` et chaque domaine personnalisé**, en nombre illimité.
`main.ts` décide maintenant le CORS requête par requête : `/public/*` (anonyme, sans
cookie ni jeton) accepte toute origine ; le reste (jeton Bearer) garde la liste
`CORS_ORIGIN`, plus `*.localhost` hors production. Vérifié : origine `*.localhost` et
`*.hotelsaver.com` acceptées sur `/public/*`, `evil.example.com` refusée sur `/chambres`.
Test navigateur : `hotel-test.localhost:5175` → site de l'hôtel (3 chambres, services) ;
`?hotel=hotel-test` idem ; sous-domaine inconnu et `localhost` nu → vitrine HotelSaver.

## 01/10/2026 — Connexion : « mot de passe oublié », création de compte, retouches desktop

Retour du patron sur la connexion desktop : le bouton « Paramètres » dans la carte n'avait pas
de sens ; il fallait « Vous n'avez pas encore de compte ? Créer un compte », « Avez-vous déjà un
compte ? Se connecter » sur la page de création, et « Mot de passe oublié ? ».

- **Desktop** : « Paramètres » sort de la carte (petit engrenage discret dans le coin — sans lui
  l'adresse de l'API ne serait plus réglable au premier lancement). Photo plus saturée et voile
  bleu nuit plus marqué à gauche (le texte blanc était illisible sur le mur clair), titre centré.
  « Créer un compte » ouvre `/inscription` du site dans le navigateur (`URL_SITE_WEB`, réglable à
  la compilation avec `VITE_URL_SITE_WEB`, `http://localhost:5175` par défaut).
- **Web** : nouvelles pages `/connexion` (explique que la connexion se fait dans l'application,
  badges des stores, liens « Mot de passe oublié ? » et « Créer un compte »), `/mot-de-passe-oublie`
  et `/reinitialiser-mot-de-passe` ; « Se connecter » dans la barre ; la page d'inscription finit
  par « Avez-vous déjà un compte ? Se connecter ». Le site n'ouvre toujours **aucune session** :
  aucune clé Supabase côté web (décision Phase 8).
- **Mobile** : « Mot de passe oublié ? » sur l'écran de connexion (création de compte déjà présente).
- **API (publique, sans jeton)** : `POST /public/mot-de-passe-oublie` (Supabase `/recover`, réponse
  identique que le compte existe ou non ; seule la limite de débit remonte, en 429 ; les autres échecs
  — SMTP non configuré… — sont journalisés côté serveur sans être révélés) et
  `POST /public/reinitialiser-mot-de-passe` (jeton du lien → `GET /auth/v1/user` pour identifier le
  compte → mise à jour par `SupabaseAdminService.mettreAJourCompte`). La page web lit le jeton dans le
  fragment `#access_token=…` et le retire aussitôt de la barre d'adresse.

### À configurer pour que l'e-mail arrive réellement

1. **`SITE_WEB_URL`** dans `apps/api/.env` (défaut `http://localhost:5175`) : adresse du site web.
2. **Supabase > Authentication > URL Configuration > Redirect URLs** : y ajouter
   `<SITE_WEB_URL>/reinitialiser-mot-de-passe`, sinon Supabase ignore `redirect_to` et renvoie vers
   son « Site URL ».
3. **SMTP personnalisé** (Supabase > Authentication > SMTP) : le service d'e-mail par défaut de
   Supabase est très limité et n'envoie qu'aux membres de l'équipe du projet. Sans SMTP, les
   clients réels ne recevront rien.

**Vérifié** : 23 tests `PublicService` (dont les 3 nouveaux), 43 tests api-client, builds. Test
navigateur réel avec un jeton de récupération généré côté admin (aucun e-mail envoyé) : lien expiré,
mots de passe différents, enregistrement, jeton retiré de l'URL, reconnexion avec le nouveau mot de
passe. **L'envoi de l'e-mail lui-même n'a pas été testé** (voir les points ci-dessus).
## 01/10/2026 — Inscription dans l'application, « Ouvrir l'application », fin du réglage d'API

Retour du patron sur l'application Windows :

1. **Inscription dans l'application, jamais renvoyée vers le web.** Le desktop avait un lien
   « Créer un compte » qui ouvrait le site. Il ouvre désormais un **formulaire d'inscription
   dans l'application** (`screens/EcranInscription.tsx`, mêmes 2 étapes et même validation que
   le mobile et le web) avec « Avez-vous déjà un compte ? Se connecter ». Enchaînement calqué sur
   le mobile : `inscrireHotel`, puis connexion immédiate ; si le compte n'est pas encore
   utilisable (e-mail non confirmé), retour à la connexion avec « Compte créé ! Vérifiez votre
   boîte mail… » et l'e-mail pré-rempli. Le mobile le faisait déjà. L'inscription **web** reste
   pour les gens qui découvrent HotelSaver sur le site.
2. **Plus aucun réglage de l'adresse de l'API dans l'interface.** Le bouton Paramètres de la
   connexion (et l'écran « paramètres hors connexion ») disparaît, ainsi que le champ « URL de
   l'API » des Paramètres desktop et mobile : c'était un héritage du développement (pointer
   l'app vers un serveur), incompréhensible et dangereux pour un utilisateur. L'adresse est
   **fixée à la compilation** : `MAIN_VITE_API_URL` (desktop, `apps/desktop/.env.example`) et
   `EXPO_PUBLIC_API_URL` (mobile, `apps/mobile/.env.example`), `http://localhost:3001` par
   défaut en développement. Un `apiUrl` mémorisé par une ancienne version est **ignoré**
   (sinon il masquerait celle du build installé). Vérifié : une valeur témoin passée au build se
   retrouve dans `out/main/index.js`. **Avant de distribuer l'app, compiler avec l'adresse de
   production**, sinon elle pointera sur `localhost`.
3. **« Ouvrir l'application » après l'inscription web.** Le site ne peut pas savoir si
   l'application est installée : la page de succès (et `/connexion`) propose « Ouvrir
   l'application » (`hotelsaver://connexion?email=…`, ou `intent://…` avec repli sur le Play Store
   sous Android/Chrome) et, juste dessous, « Pas encore installée ? » avec les badges des
   stores ; si la page reste visible ~2,5 s, un message l'explique.
   - **Mobile** : `Linking` (le schéma `hotelsaver` était déjà dans `app.json` et
     `AndroidManifest.xml` : pas de rebuild natif) ; l'e-mail est gardé en attente puis appliqué
     quand l'écran de départ est connu (la reconnexion silencieuse ne l'écrase pas) ; ignoré si
     déjà connecté.
   - **Desktop** : `app.setAsDefaultProtocolClient("hotelsaver")` (clé HKCU, sans droits
     administrateur), instance unique (`requestSingleInstanceLock` : un 2e lien ramène la
     fenêtre au premier plan), lien lu à froid via `lien:en-attente` ou en direct via
     `lien:ouvert` (preload `lireLienEnAttente` / `surLienOuvert`). **Sans installateur, le
     protocole n'est enregistré qu'après un premier lancement** de l'application ; un futur
     installateur devra faire la même déclaration.

**Vérifié** : tests navigateur du renderer desktop (plus d'engrenage ; « Créer un compte » ouvre le
formulaire dans l'app ; validations ; requête d'inscription ; retour à la connexion avec message et
e-mail pré-remplis ; « Se connecter » depuis l'inscription), test d'Electron réel en instance
isolée (lancement à froid par `hotelsaver://connexion?email=…` → e-mail pré-rempli ; second lien →
fenêtre existante mise à jour, une seule fenêtre), page de succès du web, 43 tests api-client,
23 tests `PublicService`, `tsc` desktop/mobile/web, builds web et desktop. **Non testé** : l'ouverture
réelle depuis un navigateur mobile et le comportement sur téléphone (pas de build).

**Limites** : une inscription dans l'app n'ouvre la session tout de suite que si l'e-mail est
confirmé — le **SMTP Supabase** doit être configuré (déjà signalé pour « mot de passe oublié »).
iOS : `hotelsaver://` ne fonctionnera qu'une fois l'app publiée sur l'App Store.
## 01/10/2026 — Nom de l'hôtel connecté, barre latérale claire, barres de défilement discrètes

Retour du patron sur le tableau de bord desktop :

1. **« Hôtel Chicago » en dur dans le bandeau de bienvenue** alors qu'un autre hôtel (Hôtel Test) était
   connecté. Le nom (et le slogan défini par le patron, sinon « Gestion simple. Séjour
   exceptionnel. ») vient maintenant de l'API : `GET /auth/me` renvoie en plus `hotelNom` et
   `hotelSlogan` (type partagé `ProfilConnecte`, `ClientApi.moi()`), donc **le même nom pour chaque
   rôle** (patron, réception, cafétaria) et sur le **mobile** aussi (`EcranTableauDeBord`). La photo du
   bandeau reste celle par défaut (la couverture du site de l'hôtel pourrait servir plus tard).
2. **Barre latérale claire en thème clair** : blanc cassé légèrement plus sombre que la page
   (`#e9eef5` contre `#f6f8fc`) avec un liseré, texte foncé, lien actif bleu ; **bleu nuit en thème
   sombre**. Elle passe par des variables `--sb-*` (`layout/coquille.css`) qui suivent
   `data-theme`, au lieu de couleurs blanches codées en dur sur fond `--hc-navy`.
3. **Barres de défilement fines et discrètes** : invisibles au repos, elles n'apparaissent que pendant
   le défilement puis disparaissent après ~0,9 s (`barres-defilement.ts` pose `data-defile` ; CSS
   `scrollbar-width: thin` + `scrollbar-color` transparent par défaut). Un gabarit fin reste réservé à
   droite (Chromium n'a pas de barre « overlay » sous Windows).
4. En passant : un `<button>` sans couleur propre est noir par défaut — illisible en thème sombre
   (nom de l'utilisateur en haut, chiffres des cartes). `button { color: inherit }`.

**Vérifié** (Electron réel en instance isolée, connexion avec le compte de test) : le bandeau affiche
« Hôtel Test » et son slogan ; fond de la barre latérale `rgb(233,238,245)` contre `rgb(246,248,252)` pour
la page ; thème sombre → `rgb(15,39,66)` ; la page reçoit `data-defile` pendant un défilement et le
perd ensuite ; 232 tests API (3 nouveaux pour `/auth/me`), 43 tests api-client, `tsc` desktop/mobile/api.
**Non testé** : le rendu du bandeau sur téléphone (pas de build mobile).
### Barre latérale réductible (desktop, 01/10/2026)

Un bouton rond sur le bord de la barre latérale la réduit en **colonne d'icônes** (264 px → 76 px) ; la
colonne principale étant en `flex: 1`, l'écran principal **s'élargit tout seul** (+188 px mesurés). Réduite :
logo seul, libellés et pastilles « Bientôt » masqués, titres de section remplacés par un filet, infobulle
et `aria-label` sur chaque lien pour garder un nom accessible. Le choix est mémorisé
(`localStorage`, clé `hotel-chicago:barre-laterale-reduite`) entre deux lancements. En fenêtre étroite
(< 900 px) la barre reste masquée comme avant (tiroir mobile), le bouton n'y apparaît pas. Vérifié dans un
Electron réel : réduire, naviguer barre réduite, relancer (préférence conservée), ré-étendre.
### Reçus : l'en-tête vient de l'hôtel connecté (01/10/2026)

Les reçus imprimaient **« HOTEL CHICAGO », « Quartier Congo ya Sika » et « Kasindi, Nord-Kivu, RDC » en dur**,
quel que soit l'hôtel — découvert en relisant le bandeau de bienvenue. `construireRecuFacture` et
`construireRecuVente` reçoivent maintenant un dernier paramètre `EnteteHotel` (nom, adresse, téléphone),
fabriqué par `enteteHotel(utilisateur)` d'après le profil `GET /auth/me`, qui renvoie en plus
`hotelAdresse` et `hotelTelephone` (coordonnées saisies dans « Site de l'hôtel »). Adresse et téléphone
absents ou vides → aucune ligne imprimée (pas de ligne vide). Les 9 appels desktop et mobile (facture,
vente cafétaria, journal des reçus, réimpression) sont mis à jour ; les écrans desktop concernés passent à
`ProfilConnecte`.

En passant : le **tiret long « — »** du titre du reçu cafétaria n'existe pas dans la table CP850 de
l'imprimante et s'imprimait « ? » (remplacé par « - ») ; et un caractère accentué non listé (« ñ », « å »…
dans un nom d'hôtel) retombe sur sa lettre de base avant le « ? ». Le test du paquet `receipts`
ne compilait plus depuis la phase 16 (`Client.updatedAt/syncVersion`) : corrigé, 12 tests passent.

**Vérifié** : reçu construit avec le vrai profil de l'hôtel de test puis encodé en ESC/POS — le texte envoyé
à l'imprimante contient « Hôtel Test - Cafétaria », son adresse et son téléphone, ni « Chicago » ni « ? ».
**Non testé** : une impression physique sur imprimante thermique.
### Écran blanc du desktop : filet de sécurité (01/10/2026)

Retour du patron : fenêtre desktop entièrement **blanche**. Le serveur de développement et l'API
répondaient, et une fenêtre neuve branchée sur le même serveur s'affichait normalement : la cause exacte
de cette fenêtre-là n'a pas pu être isolée (probablement une exception d'affichage après une série de
rechargements à chaud pendant que je reconstruisais les paquets partagés). Constat de fond : **sans
frontière d'erreur, toute exception pendant l'affichage démonte l'arbre React et laisse une page blanche
sans explication.** `FrontiereErreur` (autour de `<App />`, `components/FrontiereErreur.tsx`) affiche
maintenant « Un problème est survenu », le message d'erreur et un bouton « Recharger l'application ».
En passant : la police Inter, installée dans le magasin pnpm hors du dossier de l'app, recevait un 403 du
serveur de dev (`server.fs.strict: false`, développement uniquement, sans effet sur le build).
## Notifications push par hôtel et par rôle (01/10/2026)

- Tables `Notification` (hôtel, rôles ciblés, lien, clé de déduplication), `NotificationLue` (lu par utilisateur), `AppareilPush` (jeton FCM) — RLS activée sans politique.
- Isolation : `hotelId` et rôle viennent toujours du JWT ; `emettre` ne lève jamais (une alerte ratée ne casse pas une vente).
- Mobile : FCM natif (firebase-admin côté API, inactif sans `FIREBASE_SERVICE_ACCOUNT_JSON`) ; jeton retiré à la déconnexion/changement de profil (téléphone partagé). Canaux Android : réservations, stock, quotidien, sécurité.
- Desktop : interrogation toutes les 15 s, zone de notification (fermer = masquer, « Quitter » = fermer), renouvellement du jeton Supabase toutes les 40 min.
- Alertes stock au franchissement du seuil (point unique `decrementerStock`) ; crons à `Africa/Lubumbashi` (07:00 arrivées, horaire départs dépassés, 20:00 récap, 08:00 licence).
- Guide : FIREBASE.md.

## Compte cafétaria en deux niveaux (01/10/2026)

- Niveau 1 : une carte cliquable par personne (articles, total, lignes) ; toucher une personne ouvre le niveau 2.
- Niveau 2 « Ajouter pour {personne} » : recherche (sans accents), catégories, produits populaires du jour en tête, stepper +/- et panier validé en une fois. Stock épuisé non sélectionnable ; quantité plafonnée au stock connu (le serveur recontrôle).
- Populaires du jour : mobile = agrégation SQL du miroir local (marche hors ligne) ; desktop = GET /cafeteria/produits-populaires (scopé hôtel, jour à Africa/Lubumbashi).
- Le panier est écrit ligne par ligne (miroir + file de synchro sur mobile, API sur desktop) ; échec partiel desktop : seules les lignes non ajoutées restent dans le panier.

## Encaissement par personne (01/10/2026)

- `SousCompte.payeLe` et `VenteCafeteria.sousCompteId` (migration 20261001150000, colonnes nullables). Nouveau mode `UNE_PERSONNE` (+ `sousCompteId`) sur `POST /cafeteria/comptes/:id/encaisser` : un reçu individuel, la personne est verrouillée (plus de ligne ajoutable), le compte reste OUVERT et ne se ferme qu au règlement de la dernière personne ayant des lignes.
- Anti double encaissement : compare-and-swap sur `payeLe` (comme pour la fermeture du compte). `GROUPE` / `PAR_SOUS_COMPTE` / `PARTAGE_EGAL` ne portent plus que sur les personnes pas encore payées ; « Tout encaisser » = `GROUPE` sur le reste.
- Mobile : colonne `payeLe` ajoutée au SQLite local par `ALTER TABLE` si absente (téléphones déjà installés), tirée par la synchro ; l encaissement reste en ligne.

## Aperçu du reçu et masquage des personnes payées (01/10/2026)

- L aperçu du reçu (composant ApercuRecu mobile + desktop) affiche le MÊME `LigneRecu[]` que l impression : un seul calcul (`useMemo`), donc l aperçu est exactement ce qui sort imprimé.
- Une personne payée s efface de l écran du compte 1 minute après `payeLe` (`sousComptesVisibles` dans packages/types, testé) ou dès qu elle est écartée : balayage vers la droite sur mobile (PanResponder + Animated, aucune dépendance ajoutée), bouton « Masquer » sur desktop. Purement visuel : totaux, reçus et journal inchangés ; lien « N personnes payées masquées · Afficher » pour les revoir.
- « Tout encaisser » est conservé : cas d une personne qui règle pour toute la table (un seul reçu).

## Séparation des tâches (01/10/2026)

Cette décision **remplace** l interprétation « PATRON : accès total » de la phase 2 pour les opérations du quotidien (voir plus haut).

- Réserver/modifier/confirmer/check-in/check-out une réservation, créer une facture séjour, ouvrir/alimenter/encaisser un compte cafétaria et changer le **statut** d une chambre sont réservés au personnel (réception, cafétaria). Le patron les voit en lecture seule, sauf si l hôtel a activé `Hotel.patronPeutOperer` (défaut false, modifiable par le patron seul via `PATCH /hotel/reglages`, lu dans `/auth/me`).
- Le patron garde : lecture/rapports, administration (chambres : création/prix/type/suppression ; produits, taux, stock, utilisateurs, site, images) et **annulation avec motif** (hypothèse : la vente cafétaria n est annulable que par lui). 
- Double verrou : décorateur `@Operationnel()` lu par `RolesGuard` (403 clair) + même règle dans la synchro (`ENTITES_OPERATIONNELLES`, résultat ERROR) pour qu aucune écriture hors ligne ne la contourne ; une seule règle partagée `peutOperer()` (packages/types) côté API, desktop et mobile qui masquent les boutons et affichent « Lecture seule ».
- Notifications inchangées : le patron reste destinataire à titre de supervision.
- Le lien « N personnes payées masquées · Afficher » disparaît à son tour 5 minutes après le paiement (`DELAI_LIEN_PAYES_MS`) : l écran redevient propre ; le journal des reçus reste la référence pour retrouver un règlement.

## Rapports mensuels PDF par département (01–02/10/2026)

Demande du patron : chaque mois, la cafétaria et la réception remettent un rapport PDF officiel — personnalisé (hôtel, département, période, numéro unique), comparé au tableau de bord du même mois, signatures en bas, mention « Document généré par HotelSaver App ».

- **Qui génère** : le personnel du département seulement (`@Operationnel` + contrôle département↔rôle dans `RapportsService`). Le patron consulte tout et ne génère que si l'hôtel a activé `patronPeutOperer`.
- **Numérotation** : `RAP-{CAF|REC}-{AAAAMM}-{NNN}`, NNN = version. « Régénérer » crée une nouvelle version et marque l'ancienne `REMPLACE` — jamais d'écrasement (traçabilité d'un document remis). `RapportMensuel` fige `chiffres` (instantané des totaux) et `empreinte` (SHA-256 abrégé, imprimée en pied de page).
- **Fuseau** : bornes du mois en Africa/Lubumbashi (UTC+2 fixe) via `bornesDuMois()` ; `debutJournee()` du dashboard a été corrigé sur le même fuseau pour que « jour » et « mois » parlent pareil.
- **Concordance** : le tableau de bord du mois (`GET /dashboard/recette-du-mois`) appelle les MÊMES fonctions d'agrégation que le rapport — la comparaison affichée dans le PDF est réelle par construction (écart 0, ✓).
- **Double comptage évité** : `Facture.montantTotal` inclut les ventes cafétaria `FACTURE_CHAMBRE` liées au séjour ; le rapport cafétaria les isole dans `factureChambre`, le rapport réception dans `dontCafeteriaLiee`.
- **Stock** : ouverture/clôture reconstitués à rebours depuis `stockActuel` et `MouvementStock` (pas de snapshot historique) — limites signalées en pied de document.
- **PDF** : `pdfkit` (JS pur, aucun postinstall natif — compatible Render), Helvetica suffisante pour le français ; logo téléchargé puis converti en PNG par `sharp`. Filigrane « PROVISOIRE » pour le mois en cours.
- **Stockage** : bucket privé `rapports` (créé à la demande, PDF ≤ 10 Mo), lecture par URL signée 5 min après contrôle du `hotelId` du JWT — jamais d'URL publique pour les chiffres de l'hôtel.
- **Limites assumées (imprimées dans le document)** : occupation calculée sur les dates prévues (pas d'horodatage réel de check-in/out) ; annulation de vente sans retour de stock automatique.
- **Rappels** : cron le 1er du mois 08:00 (Lubumbashi) « rapport à générer » aux deux rôles ; notification au patron à chaque génération.

## Commande en ligne « Cuisine » sur le site public (03–04/10/2026)

Demande du patron : un onglet « Cuisine » sur le site web de l'hôtel pour que le client commande en ligne ; la cafétaria reçoit le détail, le client paie au comptoir (reçu existant), la livraison suit le suivi de préparation.

- **Réglage dédié `Hotel.commandeWebActivee`** (défaut false, PATRON seul via `PATCH /hotel/reglages`) — séparé de `cuisineActivee` (workflow interne) : un hôtel peut vendre en ligne sans KDS (les lignes arrivent alors directement `SERVI`), ou l'inverse.
- **Produits opt-in** : `Produit.commandableEnLigne` + `description` ; `GET /public/menu` n'expose que les produits actifs ET commandables — rien n'est publié sans choix explicite du patron.
- **Réutilisation de `CompteCafeteria`** plutôt qu'un modèle de commande dédié : `origine = "SITE_PUBLIC"`, `contactClient` (téléphone/chambre), `noteClient`, `ouvertPar = "SITE_PUBLIC"` (sentinelle déjà employée pour les réservations). Paiement, reçu, notifications, suivi cuisine et synchro mobile passent par les flux existants ; badge « Web » dans Comptes ouverts (mobile + desktop), bandeau « Commande web » avec contact et note sur le compte.
- **`POST /public/commande`** : résolution de tenant identique aux autres routes publiques, **404 uniforme** si l'hôtel est inconnu/suspendu/option désactivée (ne pas révéler l'existence ni le réglage). Plafonds 20 lignes / 50 unités par ligne, quantités agrégées par produit.
- **Prix toujours côté serveur** (snapshot nom/prix/devise sur `LigneCommande`, jamais le payload client) ; stock vérifié puis décrémenté avant les lignes. Pas de transaction interactive via le pooler : en cas d'échec en cours de route, `annulerCommandeWebPartielle` remonte le stock et supprime lignes/mouvements/sous-compte/compte (même raisonnement que la compensation de `ajouterLigne`).
- **Notification `COMMANDE_WEB`** → CAFÉTARIA + PATRON (canal demandes clients), lien `comptes-ouverts` vers le compte (nouvelle destination de notification).
- **Paiement au comptoir uniquement (v1)** : la confirmation du site l'annonce ; pas de Mobile Money/carte en ligne, pas de suivi client, pas d'endpoint `GET /public/commande/:ref`, pas d'extras/horaires — évolutions possibles.
- Anti-abus minimal v1 : validation stricte + tout-ou-rien ; throttling/honeypot à ajouter si besoin.

## Type de produit : plat préparé vs article de comptoir (04/10/2026)

Retour du patron : tout était mélangé dans l'écran Menu — le formulaire demandait
stock/seuil/prix d'achat même pour un plat cuisiné, et description/site même pour
un article de stock. Désordre.

- **`Produit.typeProduit`** (`TypeProduit` : `ARTICLE` par défaut — tous les
  produits existants étaient des articles de stock ; `PLAT`).
- **PLAT** = préparé à la commande : photo/description/publication site dans le
  formulaire, **pas de stock compté** (ni contrôle, ni décrément, ni mouvement
  d'audit dans `ajouterLigne` ; la dispo se règle via `actif`). Seuls les plats
  sont exposés par `GET /public/menu` et acceptés par `POST /public/commande` —
  la commande web ne touche donc plus du tout au stock, et `PublicService` ne
  dépend plus de `StockService`.
- **ARTICLE** = comptoir stocké : seuil/prix d'achat dans le formulaire, jamais
  publiable ni commandable en ligne (un article marqué par erreur est rejeté
  côté requête, le site ne filtre que `typeProduit = PLAT`).
- **File de production** : seules les lignes de PLATS entrent en cuisine
  (`EN_ATTENTE` si `cuisineActivee`) — vendre une bière n'encombre plus l'écran
  du cuisinier ; les articles sont créés `SERVI` directement (mobile hors ligne
  applique la même règle dans `creerLigneLocal`).
- **Stock/Inventaire** : plats exclus de `preparerInventaire` (API) et des écrans
  Stock mobile/desktop (mouvements, valeur marchande, sélecteurs).
- Miroir mobile : colonne `typeProduit` (CREATE + ALTER pour téléphones déjà
  installés), propagée par la synchro.

### Compléments au formulaire produit (04/10/2026, retour patron)

- **Photo du plat** : `Produit.photo` existait déjà mais aucun formulaire ne
  l'exposait — `SelecteurPhotos` (usage `"produit"`, max 1, cadre 1024×768)
  branché dans les formulaires mobile et desktop, nettoyage du stockage à
  l'annulation/suppression comme pour les chambres.
- **`Produit.portionsDisponibles Int?`** (PLAT uniquement) : null = illimité
  (cuisine à la commande) ; sinon décrémenté à chaque vente (comptoir +
  commande web) via `updateMany` conditionnel `gte`, remonté si la commande
  web échoue ; à 0 le plat est « Épuisé » (comptoir + site). Vide → null en
  modification pour repasser en illimité.
- **Quantité initiale** d'un article proposée à la création (`stockActuel`
  existait déjà dans CreateProduitDto) ; ensuite uniquement via l'écran Stock.
- Placeholders du formulaire adaptés au type (plat : « Poulet braisé »…).
- **Bug corrigé** : l'écran mobile « Ajouter » traitait `stockActuel = 0` des
  plats comme « Épuisé » — plats invendables au comptoir. La limite est
  désormais `portionsDisponibles` pour les plats, `stockActuel` pour les
  articles ; `creerLigneLocal` prend `cuisineActivee` (un plat hors cuisine
  active est `SERVI`, pas `EN_ATTENTE`).

## Ticket PDF + retrait de commande web par référence (06/10/2026)

Le client qui commande sur le site public obtient une **référence courte**
(8 premiers caractères de l'id du compte — `slice(0,8).toUpperCase()`),
affichée sur l'écran de confirmation et le ticket PDF.

- **Ticket PDF** : `GET /public/commande/:compteId/ticket?sousDomaine=…`
  (`StreamableFile`, `attachment`) — public (le client n'a pas de compte) mais
  restreint aux commandes `SITE_PUBLIC` de l'hôtel résolu par sous-domaine ;
  l'UUID complet fait office de capacité (non devinable en pratique).
- **Retrait par référence** : `GET /cafeteria/comptes/par-reference/:reference`
  (CAFETARIA + PATRON) — `startsWith` insensible à la casse sur les commandes
  `SITE_PUBLIC`, préfère celle encore OUVERTE ; **409 « déjà réglée » si le
  compte est FERME** — la référence devient obsolète après encaissement,
  contre la réutilisation pour un second service gratuit. Pas de colonne
  dédiée : le préfixe d'UUID suffit (collision quasi impossible sur un hôtel,
  et un doublon retombe sur le compte ouvert).
- **Deep-link notifications** : `LienNotification.id` portait déjà le
  compteId mais était jeté par `cibleDeLien`. Désormais : CAFETARIA → onglet
  Comptes + `demandeCompte` consommée par `EcranOngletComptesOuverts` ;
  PATRON (sans cet onglet) → Plus + vue `compte` (`demandePlus.compteId`).
  Desktop : `ouvrirLien` pose `compteCafeteriaOuvert` avant la page.
- **Cuisine → compte** : l'en-tête de chaque carte KDS ouvre le détail du
  compte (mobile : vue `compte` de Plus avec retour vers Cuisine ; desktop :
  page Comptes ouverts avec le compte déplié).

## Réception moderne : planning, fiche client, arrivée express, journal (06/10/2026)

Six chantiers validés pour rendre la réception « moderne » sur mobile et
desktop. Décisions structurantes :

- **`Reservation.note` + `Client.typePiece/numeroPiece/notes`** : colonnes
  ajoutées au schéma (ALTER TABLE via pooler, consignées dans
  `apply_manually.sql`). La fiche client se complète par `PATCH /clients/:id`
  — en ligne seulement (registre de police saisi au comptoir, le réseau est
  requis de toute façon) ; le miroir SQLite est mis à jour par
  `ecrireClientLocal` pour l'affichage immédiat, le pull suivant réconcilie.
- **Planning visuel** : `GET /reservations?du=…&au=…` renvoie les
  réservations qui chevauchent la fenêtre (sauf ANNULEE). Mobile = 7 jours
  (segment « Planning » de l'onglet Réserv., lit le miroir — fonctionne hors
  ligne) ; desktop = 14 jours (toggle Liste/Planning, appels API). Cellule
  vide → formulaire pré-rempli (chambre + arrivée) ; barre → détail.
- **Arrivée express (walk-in)** : `installerImmediatement` sur
  `POST /reservations` — la réservation naît `EN_COURS` et la chambre passe
  `OCCUPEE` dans **la même transaction** que le create. Remplace l'ancien
  enchaînement create + check-in en deux appels, qui laissait une
  réservation CONFIRMEE orpheline quand le check-in échouait.
- **Journal de la journée** : `GET /dashboard/journee-reception`
  (RECEPTIONNISTE + PATRON) — encaissements du jour par département/devise
  (scopé `createdBy` pour le réceptionniste comme `recetteDuJour`),
  arrivées/départs faits et restants, état du parc, comptes cafétéria
  ouverts. Heure de Lubumbashi (`debutJournee` partagé). Sert à la remise
  de poste.
- **WhatsApp client** : bouton `wa.me` sur le détail réservation (mobile +
  desktop), message pré-rempli (hôtel, chambre, dates, total, reste à
  payer, note) — zéro backend, ouverture dans l'app/le navigateur.
- **Deep-link réservation** : `demandeReservation` dans
  `ContexteNotifications` (même mécanisme que `demandeCompte`) — les liens
  `reservations` portant l'id du séjour ouvrent l'onglet Réserv. directement
  sur le détail (remontage par `key` = id de la demande).

## Client API multi-URL : câble USB ET Wi-Fi (06/10/2026)

Le téléphone de dev doit joindre le serveur local aussi bien par le câble
(`adb reverse` → 127.0.0.1) que par le Wi-Fi (IP locale du PC, qui change à
chaque réseau). Une URL unique en `.env` cassait dès que l'utilisateur
changeait de Wi-Fi ou que le tunnel sautait.

- **`ClientApi` accepte `baseUrl: string | string[]`** — chaque requête
  essaie la dernière URL qui a répondu puis les autres, et bascule
  UNIQUEMENT sur erreur réseau (fetch qui jette). Une réponse HTTP, même
  4xx/5xx, prouve qu'on parle au bon serveur : pas de basculement. Le
  `super-admin` et les fonctions publiques (`ConfigApiPublique.url`) ont le
  même comportement.
- **Candidates mobiles** (`candidatsApi()`, configuration.ts) : l'URL du
  build, puis `http://<ip>:3000` dérivée de `Constants.expoConfig.hostUri`
  (le dev-client connaît déjà l'IP Wi-Fi du PC via Metro — elle suit les
  changements de réseau sans jamais être codée en dur), puis
  `http://127.0.0.1:3000`. En production (pas de hostUri), seule l'URL
  publique du build sert — comportement inchangé.

## Relais d'authentification /auth/connexion + /auth/rafraichir (06/10/2026)

Sur un hotspot de dev, le téléphone voit l'API locale (Wi-Fi/USB) mais pas
toujours Supabase (filtrage des plages IP observé : timeouts alors que
l'Internet ordinaire passe). `connecterAvecMotDePasse` et
`rafraichirSession` tapaient Supabase directement → connexion impossible.

- **`AuthProxyController`** (public, sans garde) : `POST /auth/connexion`
  {email, motDePasse} et `POST /auth/rafraichir` {refreshToken} relaient
  vers `${SUPABASE_URL}/auth/v1/token?grant_type=…` avec la clé anon côté
  serveur ; statut et corps transmis tels quels (même mapping d'erreurs en
  français côté client, MESSAGES_PAR_CODE). Supabase injoignable → 502.
- **api-client** : `connecterViaApi`/`rafraichirViaApi` (même failover
  multi-URL que ClientApi). Mobile : `connecter()`/`rafraichir()` dans
  App.tsx préfèrent le relais ; ErreurApi 404 (vieille API) → appel direct
  Supabase en secours. Le téléphone n'a donc plus besoin d'Internet direct
  pour s'authentifier : le LAN suffit.

## Dépenses par département : réception et cafétaria (07/10/2026)

Demande : la réception et la cafétaria notent leurs dépenses (date, motif,
montant) et téléchargent la liste ; le patron n'en saisit pas.

- **Modèle `Depense`** (migration `20261007090000_depenses`, RLS activée
  sans policy comme `RapportMensuel`) : `departement` (enum
  `DepartementRapport` réutilisé), `date` en `@db.Date`, `motif`,
  `montant`/`devise` (jamais convertis), instantané `creeParId/creeParNom`,
  `updatedAt/syncVersion` pour la synchro. **Pas de suppression** : une
  erreur se corrige ou s'annule (`annulee` + `annuleeLe`, définitif) — même
  règle de traçabilité que les réservations et factures.
- **Le département vient du rôle, côté serveur** (`common/departement.ts`,
  partagé avec les rapports) : RECEPTIONNISTE → RECEPTION, CAFETARIA →
  CAFETERIA. Le client ne l'envoie jamais.
- **Le patron consulte seulement**, même si l'hôtel a activé
  `patronPeutOperer` : `@Roles(RECEPTIONNISTE, CAFETARIA)` sur l'écriture,
  pas `@Operationnel` (qui laisserait passer un patron « opérant »). Lecture
  et PDF : les trois rôles, le personnel limité à son département.
- **Hors ligne sur mobile** : `Depense` est dans `ENTITES_PUSH`. Le pull
  générique ne filtrait que par hôtel ; il gagne un `FILTRE_LECTURE` par
  entité (seul `Depense` l'utilise) pour qu'un réceptionniste ne reçoive pas
  les dépenses de la cafétaria. Le payload de synchro ne passe pas par le
  ValidationPipe : toute la validation est dans `DepensesService`. Une
  dépense pas encore synchronisée ne se corrige pas (l'UPDATE exige
  `remoteId` + `baseSyncVersion`, même règle que les réservations).
- **PDF de période** (`GET /depenses/pdf?du&au`) : généré à la demande,
  déposé dans le bucket privé `rapports` sous `{hotelId}/depenses/`, URL
  signée de 5 min. Les dépenses annulées en sont exclues. Le mobile force
  une synchro avant, pour que les saisies hors ligne y figurent.
- **Rapport mensuel** : section « 8. Dépenses du mois et solde net »
  (recettes − dépenses, devise par devise) et `depenses`/`soldeNet` figés
  dans `chiffres`. Calculé dans `RapportsService.generer`, pas dans les
  agrégats partagés avec le tableau de bord (qui ne change pas). Les
  rapports déjà générés restent tels quels ; une régénération inclut les
  dépenses.
- **Navigation** : onglet « Dépenses » (mobile) pour RECEPTIONNISTE et
  CAFETARIA, entrée « Plus » pour le patron ; page « Dépenses » (desktop,
  section Rapports) pour tous, en ligne seulement.

## Suivi de réservation par le client + pré-enregistrement en ligne (07/10/2026)

Avant : après une demande sur le site, le client n'avait aucun retour (« l'hôtel
vous contactera »). Maintenant chaque réservation a un lien « Ma réservation ».

- **`Reservation.jetonSuivi`** (UUID v4, `@unique`, généré par Prisma ; les
  réservations existantes l'ont reçu via `gen_random_uuid()` dans la migration
  `20261007120000_suivi_reservation`). C'est le seul secret du lien : pas de
  compte client. Code lisible `RES-XXXXXXXX` calculé (`codeSuivi`), jamais stocké.
- **Routes publiques** `GET /public/suivi/:jeton`, `POST …/annuler`,
  `POST …/pre-enregistrement`, toujours avec `?sousDomaine=` : la réservation doit
  appartenir à l'hôtel du site consulté, sinon **404 uniforme**. Réponse réduite :
  jamais le numéro de pièce (`pieceRenseignee: boolean`), jamais le motif interne
  d'une annulation par l'hôtel (statut public « NON_RETENUE »). Une annulation par
  le client porte le motif préfixé « Annulée par le client depuis le site » —
  c'est ce préfixe qui distingue « ANNULEE » de « NON_RETENUE ».
- Annulation / pré-enregistrement possibles si EN_ATTENTE ou CONFIRMEE, jusqu'à la
  fin du jour d'arrivée. L'écriture d'annulation est dupliquée depuis
  `ReservationsService.annuler` : `PublicService` ne dépend pas du module
  Réservations (règle existante). Réception + patron notifiés (nouveau type
  `PRE_ENREGISTREMENT`, et `RESERVATION_ANNULEE` « par le client (site web) »).
- **`demandeClient`** séparé de `note` : `note` appartient à la réception, le
  client ne doit pas pouvoir l'écraser. La pièce va sur `Client` (registre).
- `POST /public/reservations` ne renvoie plus la réservation complète (elle
  contenait la fiche client) mais `{ id, statut, jetonSuivi }` ; le site redirige
  vers `/ma-reservation/:jeton`.
- **Lien côté réception, hors ligne** : `/auth/me` expose `hotelUrlSite`
  (domaine personnalisé vérifié, sinon `SITE_WEB_URL/?hotel=<sousDomaine>`) ;
  `lienSuivi(hotelUrlSite, jeton)` (packages/types) construit le lien depuis le
  miroir local. Ajouté au message WhatsApp existant ; « Partager » (mobile, API
  `Share`, pas de module natif ajouté) / « Copier » (desktop).
- **Retirage mobile** : le pull est incrémental sur `updatedAt` ; la migration
  `20261007130000_suivi_reservation_retirage` touche `updatedAt` une fois pour que
  les téléphones retéléchargent les réservations existantes avec leur jeton.
- **Pas de throttler** sur les routes publiques : le jeton (122 bits aléatoires)
  rend l'énumération impraticable. À ajouter (`@nestjs/throttler`) si des abus
  apparaissent.
- Corrigé au passage : le message WhatsApp de la réservation commençait par
  « [object Object] » (`enteteHotel()` renvoie un objet depuis l'en-tête de reçu
  par hôtel) — il
  affiche le nom de l'hôtel.

## Réponse du réceptionniste sur le suivi client (07/10/2026)

- `Reservation.reponseReception` (migration `20261007180000_reponse_reception`) :
  texte du personnel **rendu public** sur la page « Ma réservation » — la voix
  de l'hôtel dans l'échange demande → confirmation (ex. « acompte attendu à
  l'arrivée »). Distinct de `note` (interne) et de `demandeClient` (sens
  inverse, client → hôtel).
- Passage par `PATCH /reservations/:id` existant (bloqué uniquement sur
  ANNULEE/TERMINEE — éditable dès EN_ATTENTE, là où la réponse est utile).
  Côté mobile, écriture optimiste + file UPDATE (`modifierReservationLocale`)
  → fonctionne hors ligne ; l'action n'apparaît que si la réservation est
  synchronisée (remoteId requis).
- `SuiviReservationPublic.reponseReception` exposé par
  `GET /public/suivi/:jeton` ; carte « Message de la réception » sur le site
  (`EcranSuiviReservation`, styles `suivi-texte`).
- Règle de visibilité UI : le bouton « Répondre au client » suit
  `suiviModifiable` (EN_ATTENTE/CONFIRMEE) — après check-in, la réponse
  publique n'a plus de sens (le client est sur place).

## Scan des articles à la caisse cafétaria : douchette + caméra (08/10/2026)

Adaptation à HotelSaver d'un plan « scanner comme en supermarché ».

- **`Produit.codeBarres`** (migration `20261008090000_code_barres_produit`),
  `@@unique([hotelId, codeBarres])` (NULL autorisé plusieurs fois). **ARTICLE
  seulement** : un PLAT le refuse (400), un article qui devient plat le perd.
  Code du fabricant, ou **EAN-13 interne préfixe 2** (plage GS1 « usage en
  magasin ») généré par l'app — 11 chiffres aléatoires + clé ; unicité garantie
  par l'index, un 409 sur un code généré déclenche simplement un nouvel essai.
- **Le code ne contient jamais le prix** : changer un prix ne réimprime rien, une
  étiquette ne peut pas être falsifiée.
- Doublon → **409 en français** qui nomme le produit concerné (P2002 traduit dans
  `ProduitsService`).
- **`PATCH /produits/:id/code-barres`** ouvert à CAFETARIA + PATRON : la caissière
  associe le code d'un article inconnu pendant la vente sans pouvoir toucher au
  prix ni au reste de la fiche (toujours `@Roles(PATRON)`).
- **Recherche locale** : le code est cherché dans le catalogue déjà chargé
  (miroir SQLite sur mobile) — instantané et hors ligne, aucune route « par
  code-barres ». Le scan alimente le **panier existant** de « Ajouter une
  consommation » (`changer(produit, +1)`, mêmes limites de stock).
- **`packages/receipts`** : `code-barres.ts` (clé EAN-13, générateur,
  `trouverProduitParCode`, `DetecteurRafale` pour la douchette,
  `construireEtiquette`) ; ligne de reçu `codebarre` encodée en ESC/POS natif
  (`GS h/w/H` puis `GS k 67 13` EAN-13, sinon Code128 `GS k 73`). Le desktop
  ajoute ces mêmes octets à node-thermal-printer (`append`) : un seul encodeur.
- **Mobile** : `expo-camera` (ML Kit, module natif → **reconstruire l'APK**) en
  mode continu (vente) ou unique (fiche produit), même code ignoré 1,5 s ;
  douchette via un `TextInput` caché focalisé (`showSoftInputOnFocus={false}`) ;
  retour par `Vibration` (pas de dépendance audio).
- **Desktop** : douchette = écoute `keydown` globale (`useDouchette`, rafale
  < 40 ms terminée par Entrée) ; webcam = `@zxing/browser` (`BarcodeDetector`
  n'existe pas sous Chromium Windows) ; bip WebAudio.
- **Vente rapide** (Caisse) : compte « Comptoir HH:MM » + personne « Client »,
  ouverture directe de l'ajout, scanner prêt. Le scan marche avant la synchro ;
  la validation du panier attend, comme avant, que la personne existe côté
  serveur (règle existante des lignes de commande).

## Synchronisation plus rapide pour la caisse (08/10/2026)

Constat : à la cafétaria, après « Ouvrir le compte » ou « Ajouter », les boutons
(Ajouter, Encaisser) restaient grisés plusieurs secondes, parfois ~20 s.

- **Écriture pendant un cycle en cours** : `mettreEnFile` se rattachait au cycle
  déjà lancé, qui avait lu la file avant l'écriture → l'opération attendait le
  poll suivant (20 s). `MoteurSync` mémorise maintenant `envoiDemande` et
  enchaîne un cycle dès la fin du précédent.
- **Écrans prévenus après l'envoi** : `dernierePousseeLe` est mis à jour dès que
  le push est confirmé (ids serveur connus), avant la réception des autres
  données — les écrans rechargent leur miroir et réactivent les boutons.
- **Pas de ping avant chaque envoi** si le serveur a répondu il y a < 15 s.
- **`/sync/pull` en parallèle** côté serveur (borné par le pool `pg`, max 5) :
  mesuré sur la base réelle depuis Kasindi, 11 entités 3,1 s → 0,8 s.


## 10/10/2026 — Audit d'isolation entre hôtels, tests d'intégration à deux hôtels

L'application n'est pas encore en production : tout est corrigeable sans migration de données. Avant de rendre le bureau hors ligne, on a
vérifié que les hôtels sont étanches. Un revue du code (158 appels Prisma, 33 sans `hotelId` : tous légitimes ou précédés d'une
vérification d'appartenance) ne suffisait pas : on a donc écrit une suite qui tourne sur une **vraie base Postgres locale**
(`apps/api/test/integration/`, 82 vérifications, ignorée sans `TEST_INTEGRATION=1`, avec une garde qui refuse toute base distante).

Deux hôtels, chacun avec chambres, clients, réservations, factures, produits, cafétaria, dépenses, rapports, menu, inventaire, notifications. La suite
vérifie : (1) qu'aucune liste (30 routes dont `/sync/pull`, le tableau de bord, le site public) ne contient un identifiant ou un nom de l'autre hôtel ;
(2) que ~40 demandes visant une donnée de l'autre hôtel (lecture, modification, suppression, **et identifiants étrangers glissés dans une demande
légitime**) sont refusées sans qu'une seule ligne de l'autre hôtel change (instantané JSON avant/après) ; (3) qu'un `hotelId` glissé dans un corps ou
dans `/sync/push` est ignoré ; (4) que le site public d'un hôtel ne voit ni ne touche l'autre ; (5) qu'un hôtel suspendu est bloqué sans gêner l'autre.

**Deux vrais bugs trouvés et corrigés :**
- `Chambre.numero` était `@unique` sur toute la plateforme : le deuxième hôtel à créer sa chambre « 101 » aurait reçu « existe déjà ». Désormais
  `@@unique([hotelId, numero])` (migration `20261010090000_chambre_numero_par_hotel`). À appliquer avec `migrate:verifier` puis `migrate:appliquer`.
- `POST /stock/inventaires` acceptait des `produitId` d'un autre hôtel : l'inventaire se rattachait au produit étranger et son nom, sa catégorie et son
  prix revenaient dans la réponse et dans le PDF. Contrôle d'appartenance ajouté avant la création (400 sinon).

Le schéma de la base de test se génère avec `prisma migrate diff --from-empty --to-schema` (sans les policies RLS, que l'API contourne avec `service_role`).
Voir `BACKLOG.md` pour la suite : synchronisation, bureau hors ligne, encaissement hors ligne.


## 10/10/2026 — Synchronisation solide (doublons, reprises, pagination, suppressions, horloges)

Raison : hors ligne plusieurs jours, un appareil renvoie ses actions après des coupures au mauvais moment, avec une horloge parfois fausse, face à des
serveurs qui peuvent tomber. Chaque point est couvert par un test sur vraie base (`test/integration/sync.e2e-spec.ts`, 30 vérifications) ou par un test
du moteur (`packages/sync-engine`, 32 tests).

- **CREATE rejouable** : table `SyncCorrespondance` (hôtel, type, id local) → id serveur. Le serveur *réserve* la clé avant de créer ; un renvoi retourne le
  résultat d'origine, dix envois simultanés ne créent qu'une ligne (stock modifié une seule fois). Un refus métier libère la clé ; un traitement interrompu
  (serveur arrêté entre création et enregistrement) est signalé « incertain » plutôt que risquer un doublon d'argent. (Pas de transaction englobante :
  les services métier ouvrent déjà leurs propres transactions et la latence vers Supabase l'aurait rendue fragile.)
- **UPDATE rejoué** : si le serveur contient déjà exactement les valeurs voulues, c'est `SYNCED`, plus un faux conflit. Un vrai conflit reste `CONFLICT`
  (le serveur gagne, rien n'est appliqué, la personne décide).
- **Pull paginé** : `limite` (1000 par défaut, 5000 max), `gte` + tri `(updatedAt, id)`, `_meta.tronque` liste les types à poursuivre. Le client reprend au dernier
  `updatedAt` et enregistre son curseur à chaque page : une coupure en plein rattrapage reprend où elle s'est arrêtée. Page entièrement au même instant →
  le client agrandit la page au lieu de boucler.
- **Curseur = heure du serveur** (`_meta.curseur`, moins 5 s de recouvrement), jamais l'horloge de l'appareil.
- **Suppressions** : table `Suppression` (pierres tombales), écrite dans la même transaction que la suppression d'une chambre ou d'un produit ; envoyée au
  pull (filtrée par les types que le rôle peut lire) et retirée du miroir local. Une suppression refusée (clé étrangère) n'en laisse pas.
- **Erreurs passagères** (`temporaire`) : base injoignable, délai dépassé, opération déjà en cours → l'action reste en file *sans compter un échec*. Un refus
  métier compte (3 essais puis « Action refusée », décision humaine).
- **Lots de 200** côté client (le serveur refuse davantage).
- **Horloge** : `serveurLe` à chaque réponse → décalage mesuré, signalé au-delà de 5 min ; l'heure de chaque action est envoyée corrigée
  (`horodatageClient`) et le serveur la borne (jamais dans le futur, 30 jours en arrière au plus) pour les écritures qui s'additionnent
  (mouvements de stock, lignes de commande).
- **Indicateur honnête** (`resumerEtatSync`, partagé mobile + bureau) : « À jour » seulement si la dernière synchro complète a réussi, rien à envoyer, aucune
  action refusée ; sinon on dit ce qui est vrai (hors ligne, N actions gardées sur l'appareil, conflit, horloge, données de plus de 24 h).

Limite connue : plus de 5000 suppressions entre deux synchros ne seraient pas toutes transmises (voir BACKLOG).
