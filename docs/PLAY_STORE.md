# Publier HotelSaver sur le Google Play Store

Préparé le 22/10/2026. Un compte développeur **Organisation** (avec numéro D-U-N-S) est recommandé. Un compte personnel récent
doit d'abord faire un test fermé : au moins 12 testeurs pendant 14 jours avant de pouvoir publier.

## 1. Adresses à donner à Google

| Champ de la Play Console | Adresse |
|---|---|
| Politique de confidentialité | `https://<site HotelSaver>/confidentialite` |
| Suppression du compte (« Data deletion ») | `https://<site HotelSaver>/supprimer-mon-compte` |

`<site HotelSaver>` est le site vitrine, le même que `EXPO_PUBLIC_SITE_URL`.

- Le bouton « Supprimer mon compte et mon hôtel » de l'application (Paramètres, patron seulement) ouvre cette page dans le
  navigateur.
- Sans `EXPO_PUBLIC_SITE_URL` dans le build, le bouton affiche seulement où aller.
- **Suppression : le patron seul.** Son compte, son hôtel et tout son contenu partent ensemble.
  - La réception et la cafétéria ne peuvent pas supprimer : le patron les retire de son équipe.
  - Refusée tant qu'un client est dans l'hôtel, qu'une réservation est à venir ou qu'un remboursement d'acompte reste à faire.
  - Voir `apps/api/src/reglages-hotel/suppression-hotel.service.ts`.

## 2. Formulaire « Sécurité des données » (Data safety)

Réponses tirées du code au 22/10/2026 : `app.json` (permissions), schéma Prisma, prestataires. Si une fonction se met à collecter
autre chose, mettre à jour ce tableau **et** la page `/confidentialite`.

**Questions générales**
- Collecte de données : **Oui**.
- Données chiffrées en transit : **Oui**.
- Suppression possible : **Oui**. L'adresse ci-dessus ; préciser « par le propriétaire de l'hôtel ».
- Partage avec des tiers : **Non**. Ce sont des prestataires qui agissent pour HotelSaver :
  - Supabase et Render pour l'hébergement ;
  - ScanLinkPay pour les paiements ;
  - Google Firebase pour les notifications ;
  - Cloudflare Turnstile pour l'anti-robot du site.

**Données collectées** (« traitées de façon éphémère » = **non**)

| Catégorie Google | Type | Obligatoire ? | Finalités |
|---|---|---|---|
| Informations personnelles | Nom | Obligatoire | Fonctionnement, Gestion du compte |
| Informations personnelles | Numéro de téléphone | Obligatoire | Fonctionnement, Gestion du compte |
| Informations personnelles | Adresse e-mail | Facultatif | Fonctionnement, Gestion du compte |
| Informations personnelles | Adresse (de l'hôtel) | Facultatif | Fonctionnement |
| Informations personnelles | Autres infos (clients de l'hôtel : type et numéro de pièce d'identité, notes) | Facultatif | Fonctionnement |
| Informations financières | Historique des achats (abonnement, acomptes) | Obligatoire | Fonctionnement |
| Informations financières | Autres infos financières (factures, ventes, dépenses, encaissements) | Obligatoire | Fonctionnement |
| Photos et vidéos | Photos (chambres, logo, site de l'hôtel) | Facultatif | Fonctionnement |
| Appareil ou autres identifiants | ID d'appareil (jeton de notification, appareil de synchronisation) | Obligatoire | Fonctionnement |

- **À ne pas cocher** : localisation, contacts, audio, fichiers, messages, santé, historique de navigation, infos de performance.
- **La caméra** scanne les codes-barres et prend une photo seulement si l'utilisateur en ajoute une. Ce sont les photos qu'il ajoute
  qui comptent comme collectées (ligne « Photos » ci-dessus).

## 3. Autres formulaires

- **Public cible** : 18 ans et plus (application professionnelle).
- **Publicité** : aucune.
- **Classification du contenu** : catégorie « Professionnel / productivité ».
- **Accès pour la vérification de Google** :
  - un hôtel de démonstration avec ses identifiants **patron** (numéro et mot de passe) ;
  - éventuellement un compte réception et un compte cafétéria ;
  - jamais un vrai hôtel.

⚠️ **Point de vigilance « Paiements Google Play ».** L'abonnement HotelSaver est un service numérique, payé aujourd'hui **dans
l'application** par Mobile Money (`apps/mobile/src/configAbonnement.ts` : `PAIEMENT_DANS_APPLICATION = true`). Google exige
normalement son propre système de facturation pour ce type d'achat.
- Si la version est refusée, passer `PAIEMENT_DANS_APPLICATION` à `false` : le paiement se fait alors sur le site.
- Si Google refuse aussi le lien vers le site, passer en plus `AFFICHER_LIEN_PAIEMENT_SITE` à `false`.
- Puis reconstruire. Le fichier explique les deux réglages.
- Les acomptes des clients de l'hôtel (séjours réels) ne sont pas concernés.

## 4. Construire le fichier AAB signé

La clé de publication existe déjà : `apps/mobile/signature/`, ignorée par Git, appliquée par `plugins/withSignatureRelease.js`.

**Point important avant le premier envoi.** Les APK déjà distribués par GitHub sont signés avec cette clé. Dans la Play Console,
choisir pour **Play App Signing** l'option qui **utilise la clé existante** (« Utiliser une clé de signature existante », à exporter
avec l'outil PEPK que Google fournit).
- Ainsi, l'application installée depuis GitHub et celle du Play Store ont la même signature et se mettent à jour l'une l'autre.
- Si Google génère sa propre clé, les téléphones qui ont l'APK de GitHub devront le désinstaller pour passer au Play Store.

**À chaque version**
1. Monter `version` et `android.versionCode` dans `apps/mobile/app.json`. Le `versionCode` est aujourd'hui 5 : le prochain envoi
   doit être plus grand.
2. Lancer :

```
cd apps/mobile/android
set EXPO_PUBLIC_API_URL=https://hotelsaver-api.onrender.com
set EXPO_PUBLIC_SITE_URL=https://<site HotelSaver>
set EXPO_PUBLIC_SUPABASE_URL=<projet Prod>
set EXPO_PUBLIC_SUPABASE_ANON_KEY=<clé publique Prod>
gradlew bundleRelease
```

- Le fichier obtenu est `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`. L'envoyer d'abord en **test
  interne**.
- Pour l'AAB, ne pas limiter les architectures (`-PreactNativeArchitectures`) : Google ne livre à chaque téléphone que ce qui le
  concerne.
- Après un `expo prebuild` qui régénère `android/`, le plugin remet la signature tout seul.

## 5. Captures et visuels à préparer

**Visuels obligatoires**
- Icône 512 × 512 PNG : `apps/mobile/assets/icon.png`, sur fond plein.
- Bannière 1024 × 500, par exemple « Gérez votre hôtel depuis votre téléphone » à côté d'un téléphone qui montre le tableau de bord.

**Captures de téléphone**
- De 2 à 8, en portrait 9:16 (1080 × 1920).
- À faire sur un **hôtel de démonstration**, avec des clients fictifs (jamais de vraies pièces d'identité).
- La recette du guide PDF (`docs/guide`) peut les produire.

| # | Écran | Ce qu'on doit voir |
|---|---|---|
| 1 | Tableau de bord du patron | Occupation, arrivées et départs du jour, recettes |
| 2 | Chambres | La grille des chambres avec leurs états (libre, occupée, à nettoyer) |
| 3 | Nouvelle réservation | Le formulaire avec dates, chambre et acompte |
| 4 | Facture | Une facture de séjour prête à imprimer ou partager |
| 5 | Cafétéria | La caisse avec le scan d'un code-barres et le ticket |
| 6 | Stock | Les articles et les alertes de stock bas |
| 7 | Site de l'hôtel | La page publique de réservation aux couleurs de l'hôtel |
| 8 | Rapports | Le rapport du jour ou du mois |

**Facultatif**
- Captures de tablette, car l'application déclare `supportsTablet`.

**Textes de la fiche**
- Nom : « HotelSaver ».
- Description courte : 80 caractères au plus.
- Description longue : 4000 caractères au plus.
- Je peux les rédiger sur demande.
