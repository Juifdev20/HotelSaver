# Plan de correction — sécurité et ergonomie (10/10/2026)

Issu de trois audits en LECTURE SEULE du code (serveur, applications bureau/mobile/web, ergonomie et accessibilité). Rien n'a été exécuté contre une vraie base ni sur un téléphone :
les constats sont tirés du code. Trois des plus graves (S1, S2, C1) ont été revérifiés à la main. Les points marqués « à confirmer » demandent un contrôle sur l'environnement réel.

Effort : **S** < ½ jour · **M** ½ à 2 jours · **L** > 2 jours. Les numéros renvoient aux constats (S = serveur, C = applications, U = ergonomie).

## Règle de travail
Chaque correctif de sécurité arrive avec un test qui échoue avant et passe après (tests d'intégration sur base jetable, voir `AGENTS.md`). Une phase n'est « finie » que lorsque
`pnpm --filter api test`, les tests d'intégration, les tests des paquets et `tsc --noEmit` (mobile, bureau) sont verts.

---

## Phase 1 — Urgences (avant tout essai avec de vraies données) · ~5 à 7 jours

| # | Constat | Correctif | Effort |
|---|---|---|---|
| S1 | **RLS absente** sur `MenuDuJour`, `MenuDuJourItem`, `InventairePhysique`, `InventairePhysiqueItem` : lisibles/modifiables par la clé publique anon via PostgREST, tous hôtels confondus *(à confirmer en base)* | Migration `ENABLE ROW LEVEL SECURITY` sans policy ; vérifier avec `pg_class.relrowsecurity` ; **test CI** qui échoue si une table `public` n'a pas la RLS | S |
| S2 + S5 | **Synchro sans validation** : le contenu de `/sync/push` est copié tel quel (`...dto`) → un réceptionniste peut changer `hotelId` d'une chambre (la déplacer chez un autre hôtel), envoyer une quantité négative sur un plat, une quantité en texte sur un mouvement de stock | Valider chaque payload avec les DTO HTTP (whitelist) ; dans les services, construire `data` champ par champ ; gardes `Number.isFinite`/`> 0`/borne max ; **tests** : UPDATE avec `hotelId`/`id` étranger, quantité négative | M |
| C1 | **Profil `moi` mis en cache par hôtel, pas par utilisateur** (bug introduit par moi) : hors ligne, un employé peut recevoir le profil du patron, ses actions sont alors signées au nom du patron | Clé `moi:<userId>` ; refuser `setUtilisateur`/`memoriserProfil` si `userId` change ; vider `cache:*` au changement de compte ; **test** miroir-local | S |
| S3 + S7 | Relais de connexion et routes publiques d'écriture **sans limitation de débit** (blocage de tous les employés de tous les hôtels, spam de notifications, hôtels fantômes) ; pas de `helmet` | `@nestjs/throttler` (strict sur `/auth/*` et `/public/*`, par IP et par e-mail), `trust proxy`, `helmet`, `MaxLength` sur tous les champs publics, sous-domaines réservés (`www`, `api`, `admin`…), CAPTCHA (Turnstile) sur inscription/commande | M |
| S4 | **SSRF** anonyme via `logoUrl` à l'inscription (le serveur télécharge n'importe quelle URL, sans limite de taille) | N'accepter que les URL du stockage de l'hôtel ; sinon fetch durci (https, IP privées rejetées, pas de redirection, 3 s, 1 Mo, type image) ; même chose dans `branding.ts` | M |
| S8, S9, S10 | Routes publiques qui exposent `prixAchat`, `stockActuel`, `hotelId`… ; la fiche d'un vrai client est fusionnée/écrasée par téléphone depuis le site public ; message qui révèle si un e-mail a un compte | `select` explicite ; ne jamais réutiliser une fiche existante depuis le canal public ; message neutre | S |
| S12b/c, S19 | Facture séjour « réglée » en `FACTURE_CHAMBRE` ; consommations rattachées à un séjour déjà facturé/annulé ; paramètres de requête non typés (injection d'opérateurs) | Restreindre les modes ; exiger séjour `EN_COURS` sans facture ; DTO `@IsUUID` | S |
| C-M3 | **Injection ESC/POS** : le nom saisi par un client du site peut ouvrir le tiroir-caisse ou fausser un reçu | Retirer les caractères < 0x20 et 0x7F dans `encoderTexte` ; longueur max | S |
| C-M4, C-E3 | **IPC Electron trop large** (impression vers un chemin/une adresse arbitraire, écriture libre de la configuration dont l'URL Supabase) ; `shell.openExternal` sur une URL non validée | Liste blanche des clés de configuration, validation de `interface` d'imprimante, `supabaseUrl/anonKey` figés au build ; `https:` seulement + garde `will-navigate` | S |
| U1 | **Taux de change** : « 2.800 » enregistré comme 2,8 sans confirmation | Parser explicite, bornes (ex. 500–20 000), confirmation avec rappel de l'ancien taux (mobile, bureau, et borne côté API) | S |
| U2 | **Saisie des montants** : « . » lu comme décimale (« 10.000 » → 10 FC), « 2,5 » → NaN, CDF décimaux | Utilitaire partagé `lireMontant(saisie, devise)` dans `packages/regles` (espaces, virgule, point+3 chiffres, entier en CDF, messages français) branché sur tous les écrans listés | M |
| U6 | Mobile **sans ErrorBoundary** ; `formatMontant` lève sur une valeur manquante | `FrontiereErreur` autour de la navigation ; `formatMontant` renvoie « — » | S |
| U9 | Une facture réimprimée porte la date du jour, sans mention de duplicata | Date = `facture.createdAt` ; en-tête « DUPLICATA — réimpression le … » | S |

**Sortie de phase** : les tests ci-dessus + un test d'isolation « écriture vers un autre hôtel via la synchro » ajoutés à `isolation.e2e-spec.ts`.

---

## Phase 2 — Sessions, secrets et données sur l'appareil · ~6 à 9 jours

| # | Constat | Correctif | Effort |
|---|---|---|---|
| S6 | Changer un mot de passe/désactiver un compte **ne coupe pas les sessions** (refresh token gardé) ; la réinitialisation accepte n'importe quel jeton valide | Déconnexion globale après changement (à valider selon la version de Supabase Auth) ; `Utilisateur.sessionsValidesDepuis` comparé à `iat` ; exiger un jeton de type « recovery » | M |
| C-E1 | Jeton de rafraîchissement + empreinte du mot de passe **en clair** dans `configuration.json` | Chiffrer avec `safeStorage` (Windows DPAPI), droits 0600 | M |
| C-E2 + U16 | Le **bureau rouvre la session du patron sans mot de passe** (le mobile l'interdit déjà) ; aucun verrouillage après inactivité ; aucun écran « changer mon mot de passe » | Mot de passe obligatoire pour le patron à chaque lancement ; verrou d'inactivité (mot de passe ou PIN) sur bureau ET mobile ; « changer mon mot de passe » ; œil + confirmation à la création d'un compte | L |
| C-E4 | Electron : `sandbox: false`, aucune CSP, version 32 hors support, DevTools probablement ouverts en production | `sandbox: true`, CSP stricte, mise à jour d'Electron, `setApplicationMenu(null)`/`devTools:false` en production | M |
| C-E5 | **Copie locale partagée** entre comptes d'un même poste, en clair, non effacée à la déconnexion | Chiffrer la base (clé `safeStorage`/SecureStore) **ou** la vider à la déconnexion quand la file est vide ; base par utilisateur/rôle ; « Effacer les données » aussi sur mobile | M à L |
| C-M1, C-M2 | PBKDF2 à 150 000 itérations (viser ≥ 600 000 avec ré-hachage) ; verrou de 5 essais en mémoire ; fichier non authentifié ; grâce non appliquée en cours de session ; un employé révoqué se connecte hors ligne jusqu'à 14 j | Plus d'itérations, compteur persistant à délai croissant, signature du fichier ; écran de reconnexion à l'expiration ; liste de comptes révoqués envoyée à la synchro ; grâce plus courte hors patron | M |
| C-M5 | URL de l'API non validée (HTTP, repli `127.0.0.1` envoyé même en production → mot de passe en clair) | `https` obligatoire en production ; replis locaux derrière `__DEV__` | S |
| C-M6 | Horloge mobile : contact serveur daté à l'heure du téléphone → grâce contournable | Dater avec l'heure du serveur | S |
| C-M7 | Android : `allowBackup` (à confirmer), notifications visibles sur écran verrouillé avec noms de clients | `allowBackup=false`, `lockscreenVisibility: PRIVATE`/texte neutre | S |
| C-M8 | Super-admin : jeton long en `localStorage`, pas de CSP, pas de MFA ; confirmation du changement de licence (U3) | CSP + `frame-ancestors 'none'` chez l'hébergeur, jeton court ou cookie HttpOnly, MFA ; bouton « Appliquer » avec confirmation | M |
| C-faibles | `google-services.json` absent du `.gitignore` ; `ELECTRON_RENDERER_URL`/`HOTEL_CHICAGO_USER_DATA` lus en production ; `Linking.openURL` sans contrôle de schéma ; `react-native-bluetooth-classic` en version candidate | Corriger un par un | S |

---

## Phase 3 — Intégrité de l'argent et robustesse du serveur · ~6 à 9 jours

| # | Constat | Correctif | Effort |
|---|---|---|---|
| S11 | Double réservation possible (course entre deux postes) | Contrainte d'exclusion Postgres (`btree_gist`) sur chambre × période pour `CONFIRMEE/EN_COURS`, erreur traduite en 409 | M |
| S12a | **Acompte libre** : la réception peut le modifier sans historique avant de facturer | Table de paiements d'acompte (auteur, date, montant), acompte dérivé, ajouts seulement | M |
| S12-arrondis | Montants calculés en flottants JS, stockés en `Decimal(65,30)` | Arrondir à la devise avant écriture ou utiliser `Prisma.Decimal` | M |
| S13 | La synchro renvoie la ligne complète d'une dépense d'un autre département en CONFLICT ; messages d'erreur Prisma renvoyés au client | Contrôler le rôle/département avant de renvoyer ; message générique, détail en journal | S |
| S14 | Listes non bornées, `limite` non validée, PDF de dépenses jamais supprimés, URL signée d'inventaire valable 1 an | Pagination à curseur (`take` max), bornes, clé de PDF déterministe, URL de quelques minutes | M |
| S15 | `pnpm audit --prod` : 28 vulnérabilités (multer, lodash, `@nestjs/core`, qs, body-parser, file-type…) | Mises à jour/`overrides`, `pnpm audit --prod` en CI | S à M |
| S16 | Suppression d'image : contrôle de chemin incomplet *(à confirmer)* | Nom imposé `^[0-9a-f-]{36}\.webp$` | S |
| S17-18, 20-28 | En-têtes, CORS vide = ouvert, antidatage jusqu'à 30 j, JWT sans `issuer/audience`, jeton push repris par un autre hôtel, annulation publique avec le seul lien de suivi, stock non atomique, TLS base de données, journaux, numérotation de rapports | Un par un (la plupart S ; stock atomique M) | S–M |
| U3 | Actions monétaires/irréversibles **sans confirmation** (facturer + check-out, annuler un reçu, retirer une action refusée, supprimer produit/chambre, désactiver un compte, changer la licence d'un hôtel, retirer un domaine) | Confirmation précise (qui, quoi, combien), bouton destructif nommé | M |
| U14 | Encaissement café **sans montant remis ni monnaie à rendre** | Réutiliser le bloc de la facturation ; montant remis obligatoire en espèces | M |
| U15 | Reçu provisoire : pas de marqueur « Provisoire » dans le journal ni sur le bureau ; message « envoyé à l'imprimante » sans retour réel | Badge partout, message adapté | S |
| U11 | Inventaire mobile : produit non compté = 0, virgule non lue, saisie perdue au retour, aucune confirmation | Refuser vide/NaN en nommant le produit, confirmation avec nombre d'écarts, brouillon, entiers/décimaux alignés avec le bureau | M |

---

## Phase 4 — Terrain mobile · ~5 à 8 jours

| # | Constat | Correctif | Effort |
|---|---|---|---|
| U4 | État hors ligne/« action refusée » réduit à un point de 8 px | Bandeau texte fixe (« Hors ligne · 3 à envoyer »), rouge et cliquable en cas de refus/conflit | M |
| U5 | Bouton Retour Android non géré (panier et saisies perdus, sortie de l'app) | `BackHandler` par écran + confirmation d'abandon | M |
| U7 | Erreurs de validation **cachées derrière une modale** (annulation, modification de réservation, désactivation de compte) | Afficher l'erreur dans la modale (`accessibilityRole="alert"`) | S |
| U12 | Toucher hors d'une feuille modale la ferme et **efface la saisie** | Pas de fermeture sur le fond si champ modifié ; brouillon conservé | S |
| U8 | Changer d'utilisateur **impossible hors ligne** ; appui long qui retire un profil sans confirmation | Vérification locale du mot de passe (comme le bureau), bouton explicite + confirmation | L |
| U13 | Messages techniques ou anglais (« Erreur 500 sur /factures/… », JSON brut dans les conflits, erreurs Bluetooth) | Table de traduction centrale (statut + codes) dans l'api-client | M |
| U20 | Erreurs avalées (cuisine, chargement des produits, PDF, `useDonnee` qui vide la liste) | Message visible, conserver les données précédentes | S |
| U21 | Dates/fuseaux (`Africa/Lubumbashi` jamais appliqué), USD sans séparateur de milliers, formats incohérents | Fuseau explicite dans un utilitaire de dates partagé ; un seul `formatMontant` | M |

---

## Phase 5 — Accessibilité et finitions · ~5 à 7 jours

| # | Constat | Correctif | Effort |
|---|---|---|---|
| U10 | Contrastes sous 4,5:1 (succès 2,6 · alerte 2,3 · danger 3,8 · gris faible 2,6), y compris boutons de cuisine | Assombrir les teintes de texte, teintes claires réservées aux fonds/icônes (mode sombre inclus) | M |
| U17 | Pas de `accessibilityLabel`/`State`/`Role` sur boutons − +, chips, Switch, champs ; erreurs non annoncées | Poser les attributs (liste dans l'audit) | M |
| U18 | Zones tactiles < 44 px (steppers 36, chips 34, onglets 38, bouton `--sm` du bureau 36) | `minHeight/minWidth` 44 ou `hitSlop` | S |
| U19 | Bureau/web/super-admin : lignes de tableau cliquables sans clavier, menus ARIA incomplets, modales sans `role="dialog"`/Esc/piège de focus, `select` sans libellé | Boutons dans les lignes, vraies modales accessibles, titres de page et focus | M |
| U22-26 | Incohérences mobile/bureau, ticket de test « HOTEL CHICAGO » codé en dur, hauteurs fixes qui rognent le texte agrandi, listes `.map` non virtualisées, pas de mode sombre mobile, `Button` sans état `loading` | À traiter en fin de chantier | S–M |

---

## Décisions et accès dont j'ai besoin de vous
1. **Supabase** : confirmer l'état réel de la RLS (S1), les options de révocation de session (S6) et le quota de connexion (S3).
2. **Hébergeur du web/super-admin** : pouvoir poser des en-têtes (CSP, `frame-ancestors`).
3. **Electron** : accord pour monter de version (peut demander de retester l'impression).
4. **MFA super-admin** et **CAPTCHA** (Turnstile) : OK pour ajouter ces dépendances ?
5. **Verrou d'inactivité** : mot de passe ou code PIN court ? (recommandé : PIN court pour le personnel, mot de passe pour le patron)
6. **Copie locale** (C-E5) : vider à la déconnexion (simple, mais exige le réseau à la reconnexion) ou chiffrer (plus long, garde le hors-ligne) ?

## Ce que ces audits ne couvrent pas
Ils n'ont rien exécuté : pas de test d'intrusion réel, pas de lecture du manifeste Android (généré, absent du dépôt), pas de vérification de la configuration Supabase/hébergeur. Un test sur téléphone et sur Windows reste nécessaire après la phase 1 et après la phase 4.
