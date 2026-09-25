# apps/mobile — Application React Native (Expo)

Première tranche verticale de la Phase 5 : **sélection de profil, connexion,
tableau de bord, Chambres**, de bout en bout contre la vraie API et la vraie
base Supabase — pas de mock. Le reste (réservations, check-in/out, caisse
cafétaria, stockage hors ligne SQLite, synchronisation, impression thermique
Bluetooth) n'est pas encore construit.

## Fait

- **Sélection de profil au démarrage** (section 5) : un même téléphone peut
  être partagé par plusieurs membres du personnel. L'écran d'accueil liste
  les comptes déjà connectés sur cet appareil (nom, rôle) ; en choisir un
  tente un rafraîchissement silencieux de session, sinon redemande le mot de
  passe. « Ajouter un compte » ouvre une connexion classique. Appui long sur
  un profil pour le retirer de l'appareil.
- **Connexion** directe à Supabase Auth, puis `GET /auth/me` pour le nom et
  le rôle réels (jamais déduits du token) — même principe que le desktop.
- **Jeton de rafraîchissement stocké de façon chiffrée** (`expo-secure-store`,
  Keystore/Keychain du système), jamais le mot de passe. La liste des profils
  (nom/rôle/email, non sensible) vit dans `AsyncStorage`.
- **Tableau de bord** : recette du jour (USD/CDF jamais fusionnés) et taux
  d'occupation, filtrés par rôle (matrice 9.3).
- **Chambres** : liste avec statut en couleur + mot, prix formaté dans sa
  propre devise.

## Choix techniques (voir DECISIONS.md pour le détail)

- **Workflow bare/prebuild** (pas Expo Go) dès cette première tranche : le
  Bluetooth pour l'impression thermique (section 11) en a besoin, autant
  poser cette fondation tout de suite plutôt que migrer plus tard.
- **`node-linker=hoisted`** dans le `.npmrc` racine : recommandation
  officielle d'Expo pour les monorepos pnpm, Metro ne résolvant pas
  correctement les symlinks stricts par défaut.
- **`formatMontant` dupliqué** depuis `packages/ui` plutôt qu'importé : ce
  paquet charge des `.css` en effet de bord, que Metro ne sait pas
  interpréter. Toute autre logique de présentation partagée devra suivre la
  même règle (copie ciblée, jamais tout le paquet `ui`).
- `packages/ui` (CSS) et `packages/database` (Prisma côté serveur) ne sont
  **pas** des dépendances de cette app — seuls `@hotel-chicago/types` et
  `@hotel-chicago/api-client` (logique pure, indépendante de la plateforme)
  sont partagés avec le desktop.

## Lancer

```bash
pnpm build                          # à la racine : construit aussi les paquets partagés
pnpm --filter mobile android        # build natif + installation sur un appareil/émulateur connecté (adb)
```

Un téléphone Android branché en USB avec le débogage activé (`adb devices`
doit le lister) fonctionne directement — aucune configuration réseau requise
pour le développement :

```bash
adb reverse tcp:8081 tcp:8081   # Metro (le bundler)
adb reverse tcp:3001 tcp:3001   # API de l'hôtel
```

L'API doit tourner (`pnpm --filter api start:dev`, ou `node dist/main.js`)
et son URL doit correspondre à celle des Paramètres de l'app (par défaut
`http://localhost:3001`, cohérent avec les tunnels ci-dessus).

## Pas encore fait

Stockage hors ligne SQLite + file de synchronisation (section 10), écran
Paramètres (URL de l'API modifiable sans recompiler, comme le desktop),
impression thermique Bluetooth (section 11), écrans Cafétaria, sélecteur
d'imprimante. Voir `DECISIONS.md` pour le découpage complet des phases.
