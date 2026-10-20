# Interface MOBILE dans un navigateur (captures du guide)

Fait tourner le **vrai code** de `apps/mobile` (écrans, composants, navigation, jetons de couleurs, moteur de synchronisation, client API) dans Chromium,
via `react-native-web` + esbuild, pour photographier l'interface téléphone. Rien n'est modifié dans `apps/mobile` ni dans `packages/*` : les modules
natifs sont remplacés **à la compilation** par des substituts (`shims/`).

## Utiliser

```
cd docs/guide/outils/mobile-web && npm install          # une fois (react-native-web, esbuild, Roboto ; ne touche pas au lockfile racine)
docs/guide/outils/mobile-web/demarrer.sh 40400 hotel_t5 # hôte de démonstration (hote.sh) + compilation si nécessaire + service
#   API 40401 · auth 40402 · bureau 40403 · MOBILE http://127.0.0.1:40404/
GUIDE_PORT_BASE=40400 GUIDE_SORTIE=docs/guide/captures/mobile-essai node docs/guide/outils/mobile-web/exemple-captures.cjs [patron|recep|caf|connexion]
docs/guide/outils/mobile-web/arreter.sh 40400           # arrête service mobile + hôte
```

Prérequis de l'hôte : voir `../hote.sh` (Postgres local jetable, base créée avec le schéma Prisma). `RECOMPILER=1` force la compilation ;
`SANS_HOTE=1` ne touche pas à l'hôte. `GUIDE_TELEPHONES=1 demarrer.sh …` donne un numéro aux comptes de démonstration (voir « Connexion »).
Dans un navigateur de bureau, `http://127.0.0.1:40404/` s'affiche dans un cadre 390 × 844 ; dans un viewport de téléphone, en plein écran.

## Écrire un script de captures

Même API que `../lib.cjs` : `const m = require("./mobile.cjs")`.

```js
const nav = await m.navigateur();
const ctx = await m.contexte(nav, { heure: "9:41" });   // 390x844, x2 ; options : largeur, hauteur, echelle, barreEtat, haut, bas, heure, imprimantes, sombre
const page = await m.connecter(ctx, "patron");          // "patron" | "recep" | "caf" ; ouvrir(ctx) = écran de connexion sans se connecter
await m.aller(page, "Chambres");                        // onglet du bas, sinon entrée de l'écran « Plus » (Menu, Stock, Utilisateurs, Abonnement…)
await m.photo(page, "patron-chambres");                 // -> GUIDE_SORTIE (défaut docs/guide/captures/brut-mobile)
await m.inventaire(page);  m.mesurer(page, locator);  m.defiler(page, 600|Infinity|-Infinity);  m.fermerTiroir(page) /* Échap : menu, feuille */  m.retour(page);
```

`photo` attend la fin des indicateurs de chargement. `exemple-captures.cjs` montre les écrans de connexion, l'accueil, les onglets, « Plus » et tous
ses écrans, le menu du compte, les notifications, quelques détails, pour les trois rôles (~80 images).

## Ce qui est fidèle / simulé

- Fidèle : tout le JavaScript de l'application, ses couleurs (`tokens.ts`), ses icônes (lucide, SVG), ses données (synchronisation réelle avec le serveur de
  démonstration, copie locale dans IndexedDB). L'application s'exécute « en Android » (`Platform.OS = "android"`, comme sur le téléphone).
- Police : Roboto (police d'Android) embarquée, sinon Chromium prendrait une police du poste.
- Marges de sécurité : barre d'état 28 dp en haut, barre de gestes 16 dp en bas, données à l'application comme sur un téléphone ; barre d'état
  (heure, réseau, batterie) et pilule de gestes dessinées en HTML par-dessus (`barreEtat: false` ou `?barre=0` pour les retirer, `heure` pour figer l'heure affichée,
  `haut`/`bas` pour les marges). Ce n'est pas de l'interface de l'application.
- Boîtes de dialogue (`Alert`, confirmations) : dessinées en HTML façon Android (`shims/alerte.js`).
- SQLite (`expo-sqlite`) : remplacé par IndexedDB (`shims/baseLocale.web.ts`), la persistance déjà utilisée par l'application bureau avec le même paquet
  `miroir-local`. Le profil, le jeton et la configuration vont dans `localStorage` (AsyncStorage / SecureStore). Chaque contexte Playwright repart donc d'une copie vide.

## MODE SOMBRE : il n'existe pas dans l'application mobile

Constaté dans le code : `EcranParametresMobile.tsx` le dit (« pas de bascule de thème (pas de mode sombre mobile) »), aucun écran ne lit `useColorScheme` /
`Appearance`, toutes les couleurs sont les constantes de `tokens.ts`. Seule l'application **bureau** a une bascule claire/sombre. Il est donc **impossible**
de photographier un mode sombre mobile fidèle : `contexte(nav, { sombre: true })` règle `prefers-color-scheme: dark` (et avertit) mais l'écran reste clair ;
`basculerSombre(page)` lève une erreur explicite. Contournements honnêtes : ne pas promettre de mode sombre dans le guide mobile, ou le montrer sur le bureau
(déjà disponible), ou, si le mode sombre mobile est développé un jour, il apparaîtra tel quel avec `sombre: true`.

## Connexion

Sur mobile la voie normale est le numéro (+243) ; les comptes de démonstration n'ont qu'un e-mail, donc `connecter` passe par « Ancien compte ? Se connecter
avec un e-mail » (`gl-patron|recep|caf@exemple.test`, mot de passe `motdepasse-test`). Avec l'hôte lancé par `GUIDE_TELEPHONES=1` (option ajoutée à
`apps/api/test/integration/guide-hote.ts`, sans effet par défaut), les comptes ont les numéros 970 000 001 (patron), 002 (réception), 003 (cafétaria) et
`connecter(ctx, role, { telephone: true })` (ou `GUIDE_TELEPHONES=1` dans l'environnement du script) se connecte comme un vrai utilisateur. Cette voie
n'a pas pu être vérifiée de bout en bout (voir rapport) ; la voie e-mail l'a été pour les trois rôles.

## Limites et contournements

| Fonction native | Dans le navigateur | Pour une capture |
|---|---|---|
| Caméra / lecteur de codes-barres | cadre sombre « Caméra non disponible » | photographier l'écran tel quel ; saisir le produit à la main |
| Impression Bluetooth | Bluetooth « éteint » (message réel de l'écran Imprimante) | `contexte(nav, { imprimantes: [{ name, address }] })` simule des imprimantes appairées ; impression impossible |
| Notifications système / push | aucune ; la cloche et le centre de notifications de l'application fonctionnent | provoquer l'événement côté serveur |
| Galerie photo (choix d'images) | choix toujours annulé | non capturable avec une vraie photo |
| Bouton Retour d'Android, vibration | sans effet | — |
| Verrouillage d'écran, partage système (`Share`) | comportement du navigateur | — |

Autres écarts : l'horloge du tableau de bord est celle du poste ; les écrans qui n'existent qu'avec des données absentes de l'hôte (par ex. « abonnement
expiré ») demandent d'adapter la base de démonstration. Le dossier `dist/` et `node_modules/` sont ignorés par git.
