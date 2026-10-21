# Reconstruire les fichiers .env (après une réinstallation de la machine)

Les bases de données, le site, l'API et les applications publiées ne sont **pas** sur la machine : rien n'est perdu de ce
côté. Seuls les fichiers de réglages locaux (`.env`, jamais dans Git) et la clé de signature Android sont à refaire.

Vérification à tout moment, sans afficher aucune valeur : `node scripts/verifier-env.mjs`

## 1. Les fichiers, dans l'ordre
Pour chacun : copier le `.env.example` voisin en `.env` (ou `.env.test` / `.env.prod`), puis coller les valeurs.

| Fichier | Projet Supabase | Indispensable |
|---|---|---|
| `packages/database/.env.test` | **Hotelsaver Test** | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `packages/database/.env.prod` | **Hotelsaver Prod** | les trois mêmes, du projet Prod |
| `apps/api/.env` | **Test** (jamais Prod en local) | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGIN`, `SITE_WEB_URL` (valeurs locales du `.env.example`) |
| `apps/super-admin/.env` | Test | `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `apps/web/.env` | — | `VITE_API_URL` (le reste : liens de téléchargement, clé Turnstile de site) |
| `apps/mobile/.env`, `apps/desktop/.env` | vide = Test | seulement pour fabriquer l'APK / l'installateur publiés (valeurs Prod, voir `AGENTS.md`) |

## 2. Où trouver chaque valeur
| Valeur | Où |
|---|---|
| `SUPABASE_URL`, clé `anon`, clé `service_role` | Supabase → projet (Test ou Prod) → **Project Settings → API** |
| `DATABASE_URL` | Supabase → projet → **Connect → Transaction pooler** (port **6543**, sans `?pgbouncer=true`) |
| Mot de passe de la base (dans `DATABASE_URL`) | Le gestionnaire de mots de passe ; sinon Supabase → **Database → Reset database password**. ⚠️ Pour **Prod**, mettre aussitôt la nouvelle `DATABASE_URL` dans Render (service de l'API), sinon l'API en ligne s'arrête |
| Toutes les variables de l'API **en production** (`TURNSTILE_SECRET`, `LINKPAY_*`, `ACOMPTE_CARTE`, `RENDER_WEB_SERVICE_ID`, `EMPREINTE_SEL`…) | **Render** → service de l'API → **Environment** (icône œil). À recopier seulement si on en a besoin en local |
| Variables du site en production (`VITE_*`) | Render → service du site → Environment |
| `RENDER_API_KEY` | Render → Account Settings → API Keys : l'ancienne ne se relit pas, en **créer une nouvelle** (seulement si on gère les domaines d'hôtels depuis la machine) |
| `TURNSTILE_SECRET`, `VITE_TURNSTILE_SITE_KEY` | Cloudflare → Turnstile |

Ne rien changer sur Render ni dans Supabase Prod pour reconstruire la machine (sauf le mot de passe de base, s'il est
réinitialisé). `EMPREINTE_SEL` : garder la même valeur que Render.

## 3. Clé de signature Android (`apps/mobile/signature/`)
Deux fichiers : `hotelsaver-release.keystore` et `keystore.properties` (voir `apps/mobile/plugins/withSignatureRelease.js`).
Ils n'existent **que** là où ils ont été sauvegardés.

**Chercher d'abord** : clé USB, disque externe, Google Drive / OneDrive (le dossier du projet était-il synchronisé ?),
e-mails envoyés à soi-même, gestionnaire de mots de passe, une autre machine qui a construit l'APK.

**Si elle est vraiment perdue** : l'application n'est pas encore sur le Play Store (APK publiée sur GitHub), donc on
peut repartir avec une nouvelle clé, avec une seule contrainte : **chaque téléphone devra désinstaller l'ancienne
application avant d'installer la nouvelle** (Android refuse une mise à jour signée par une autre clé).
1. Prévenir les hôtels : avant de désinstaller, ouvrir l'écran **Synchronisation** et attendre que tout soit envoyé
   (les opérations hors ligne non envoyées seraient perdues avec l'application) ; les données sont sur le serveur et
   reviennent à la connexion.
2. Créer la nouvelle clé (Java installé, dans `apps/mobile/signature/`) :
   ```
   keytool -genkeypair -v -keystore hotelsaver-release.keystore -alias hotelsaver -keyalg RSA -keysize 2048 -validity 10000
   ```
   puis `keystore.properties` :
   ```
   storeFile=hotelsaver-release.keystore
   storePassword=<mot de passe choisi>
   keyAlias=hotelsaver
   keyPassword=<mot de passe choisi>
   ```
3. **La sauvegarder tout de suite à deux endroits** (clé USB + coffre en ligne), avec les mots de passe.
4. Monter la version, construire l'APK et publier comme d'habitude (`AGENTS.md`, « Publier une version »), en
   précisant dans la release qu'il faut désinstaller l'ancienne application.

Pour le Play Store plus tard : activer **Play App Signing** (Google garde la clé de signature, la perte de la clé
d'envoi devient alors récupérable).
