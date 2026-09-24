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

## render.yaml (section 15)

Non créé dans cette passe : le déploiement Render est une étape de la Phase
8 du plan de réalisation, après que les modules métier réels existent.
Créer un `render.yaml` maintenant, pointant vers une API qui n'expose que des
routes stub, n'aurait pas de valeur et créerait un faux sentiment
d'achèvement.
