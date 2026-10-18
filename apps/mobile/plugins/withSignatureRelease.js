const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Signature de la version publiée (18/10/2026). Le dossier android/ est regénéré par Expo (prebuild) et ignoré par Git : la
 * clé vit donc HORS de lui, dans apps/mobile/signature/ (ignoré par Git, à sauvegarder précieusement) :
 *   signature/hotelsaver-release.keystore   la clé
 *   signature/keystore.properties           storeFile, storePassword, keyAlias, keyPassword
 * Sans ces fichiers (autre poste, CI), la version « release » retombe sur la clé de debug, comme le gabarit d'Expo : la
 * compilation marche, mais l'APK ne pourra pas mettre à jour une application signée avec la vraie clé.
 *
 * ⚠️ Perdre la clé = ne plus jamais pouvoir publier de mise à jour de l'application sous le même nom (Play Store compris).
 */
const CONFIG_RELEASE = `
        release {
            // Clé de publication : apps/mobile/signature/ (voir plugins/withSignatureRelease.js).
            def fichierSignature = rootProject.file("../signature/keystore.properties")
            if (fichierSignature.exists()) {
                def proprietes = new Properties()
                fichierSignature.withInputStream { proprietes.load(it) }
                storeFile rootProject.file("../signature/" + proprietes["storeFile"])
                storePassword proprietes["storePassword"]
                keyAlias proprietes["keyAlias"]
                keyPassword proprietes["keyPassword"]
            }
        }`;

/** Transformation pure du build.gradle (réutilisée pour mettre à jour un dossier android/ déjà généré). */
function ajouterSignatureRelease(src) {
  if (src.includes("../signature/keystore.properties")) return src;
  // 1. Une configuration « release » à côté de « debug » dans signingConfigs.
  src = src.replace(/signingConfigs \{/, `signingConfigs {${CONFIG_RELEASE}`);
  // 2. Le type de build « release » l'utilise si la clé est là (sinon : clé de debug, comme avant).
  src = src.replace(
    /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
    '$1signingConfig rootProject.file("../signature/keystore.properties").exists() ? signingConfigs.release : signingConfigs.debug',
  );
  return src;
}

module.exports = (config) =>
  withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = ajouterSignatureRelease(cfg.modResults.contents);
    return cfg;
  });
module.exports.ajouterSignatureRelease = ajouterSignatureRelease;
