# apps/desktop — Application Electron (Réception)

Connexion, écran Chambres, et depuis la Phase 6 : facturation de séjour et
impression thermique du reçu chambre, de bout en bout contre la vraie API et
la vraie base Supabase. La Cafétaria desktop (Caisse/Menu/Stock) et les
Réservations (nouvelle réservation, arrivées/départs) ne sont pas encore
construites — voir `DECISIONS.md`.

## Fait

- **Connexion** directe à Supabase Auth (email/mot de passe), puis `GET
  /auth/me` pour connaître le nom et le rôle réels de l'utilisateur. Les
  erreurs sont en français (mauvais mot de passe, compte désactivé,
  internet coupé), jamais le texte anglais brut de Supabase.
- **Session conservée** entre deux lancements (section 14) : le jeton de
  rafraîchissement est mémorisé dans le dossier de données de l'app et
  échangé silencieusement au démarrage.
- **Écran Chambres** : grille de `RoomCard` (`@hotel-chicago/ui`) alimentée
  par `GET /chambres`, prix formatés dans leur propre devise (`45.00 $`,
  `20 000 FC`), statut en couleur + mot.
- **Facturation** (section 11.2) : liste des séjours `EN_COURS` sans
  facture, détail avec récapitulatif/consommations cafétaria liées/mode de
  paiement, "Facturer et check-out". Impression du reçu via
  `node-thermal-printer` (connexion réseau ou port série/USB à régler dans
  Paramètres > Imprimante) — voir `DECISIONS.md`, Phase 6, pour ce qui est
  volontairement hors scope (file d'impression Windows, cafétaria desktop).
- **Mode sombre** (section 2), mémorisé entre les lancements.
- **Paramètres** : URL de l'API modifiable sans recompiler (section 6),
  stockée dans `configuration.json` du dossier de données de l'app.

## Lancer

```bash
pnpm build                     # à la racine : construit aussi les paquets partagés
pnpm --filter desktop dev      # mode développement (rechargement à chaud)
```

L'API doit tourner (`pnpm --filter api start:dev`) et son URL doit
correspondre à celle des Paramètres (par défaut `http://localhost:3000`).

## Tests E2E (Playwright, vraie app Electron)

Lance la vraie app buildée (`out/`) et vérifie le DOM réellement rendu —
aucun mock. Nécessite l'API en marche et un vrai compte Supabase Auth lié à
une ligne `Utilisateur`. Sans ces variables, les tests sont **ignorés** (pas
faussement réussis) :

```bash
pnpm --filter desktop build
E2E_API_URL=http://localhost:3000 \
E2E_EMAIL=... E2E_MOT_DE_PASSE=... \
E2E_CHAMBRES_ATTENDUES="101,102" \
E2E_TEXTES_ATTENDUS='45.00 $|20 000 FC|Libre' \
pnpm --filter desktop test:e2e
```

Chaque test utilise un dossier de données temporaire isolé
(`HOTEL_CHICAGO_USER_DATA`), sans toucher à la configuration ni à la
session de l'instance normale.

Depuis un terminal VS Code, la variable `ELECTRON_RUN_AS_NODE=1` héritée de
VS Code est retirée automatiquement par les tests (sinon Electron démarre
comme un simple Node). Pour lancer l'app à la main depuis un tel terminal :
`env -u ELECTRON_RUN_AS_NODE pnpm --filter desktop dev`.

## Vérification visuelle

Aucun outil de capture d'écran n'était disponible pendant la construction :
les tests vérifient le texte affiché, les attributs et le comportement, pas
l'apparence exacte. Un contrôle visuel humain de la charte (section 12)
reste à faire.
