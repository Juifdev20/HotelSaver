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

## Vérifier que ça marche (diagnostic)

Dans l'application mobile : **Plus › Diagnostic des notifications**. L'écran vérifie, dans l'ordre : la permission Android, l'identifiant Firebase du téléphone (absent = application
construite sans `google-services.json`), l'enregistrement du téléphone auprès du serveur, la clé Firebase du serveur (`FIREBASE_SERVICE_ACCOUNT_JSON` sur Render) et les canaux sonores ;
puis « Envoyer le test » envoie une vraie notification (fermer l'application et verrouiller l'écran pour l'essayer). Si le test est « envoyé » mais n'apparaît pas : réglages de
batterie du téléphone (Tecno, Infinix, Xiaomi, Samsung… arrêtent les applications fermées) — le bouton de l'écran ouvre les réglages.
