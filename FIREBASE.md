# Notifications push (Firebase) — mise en place

Sans Firebase, tout fonctionne (cloche, centre de notifications, notifications Windows). Firebase ajoute les
notifications **téléphone éteint / application fermée**.

1. https://console.firebase.google.com → **Ajouter un projet** (gratuit, Analytics inutile).
2. Dans le projet : **Ajouter une application Android**, nom de package **`com.hotelsaver.app`**.
3. Télécharger **`google-services.json`** et le placer dans `apps/mobile/` (ignoré par git).
4. **Paramètres du projet → Comptes de service → Générer une nouvelle clé privée** (fichier JSON, SECRET).
5. Donner cette clé à l'API dans la variable d'environnement `FIREBASE_SERVICE_ACCOUNT_JSON`
   (JSON brut, ou encodé en base64 : `base64 -w0 cle.json`). En local : `apps/api/.env`. Sur Render : *Environment*.
6. Reconstruire l'application Android (le fichier est pris en compte au build) :
   `pnpm --filter mobile android`.
7. Au premier lancement, accepter la demande de notifications. Se connecter : le téléphone est enregistré
   au nom de l'utilisateur connecté et retiré à la déconnexion / au changement de profil.

Au démarrage de l'API, le journal indique « Push désactivé » tant que la clé est absente.

## Vérifier que ça marche

L'écran « Diagnostic des notifications » a été **retiré de l'application** (13/11/2026) : les notifications fonctionnent, il n'a plus d'utilité pour les utilisateurs. Les routes du
serveur qu'il utilisait (`GET /notifications/push/etat`, `POST /notifications/push/test`, réservées à MES téléphones) restent disponibles pour un contrôle à la main si besoin. Si une
notification ne s'affiche pas application fermée : permission Android, `google-services.json` dans l'APK, clé Firebase du serveur (`FIREBASE_SERVICE_ACCOUNT_JSON` sur Render), et réglages de
batterie du téléphone (Tecno, Infinix, Xiaomi, Samsung… arrêtent les applications fermées).

**Icône des notifications** : Android n'utilise que la FORME (la transparence) de la petite icône, jamais ses couleurs. `assets/notification-icon.png` est donc une silhouette blanche du logo sur
fond transparent (l'ancienne, un carré blanc plein, s'affichait comme une place vide). Elle est copiée par `expo prebuild`, ou sur un dossier `android/` déjà généré par
`pnpm --filter mobile icone-notification` ; le serveur nomme aussi l'icône (`notification_icon`) et la couleur d'accent dans chaque message.
