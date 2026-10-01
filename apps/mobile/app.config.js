const fs = require("fs");
const path = require("path");

/**
 * Complète app.json : `google-services.json` (clé Firebase du projet Android, voir FIREBASE.md) est
 * déclaré SEULEMENT s'il est présent. Sans lui l'application se compile et fonctionne normalement ;
 * seules les notifications push téléphone éteint restent inactives.
 */
module.exports = ({ config }) => {
  const fichier = path.join(__dirname, "google-services.json");
  if (!fs.existsSync(fichier)) return config;
  return { ...config, android: { ...config.android, googleServicesFile: "./google-services.json" } };
};
