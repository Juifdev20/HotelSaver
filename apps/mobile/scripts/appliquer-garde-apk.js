// Ajoute la garde « adresse du serveur » (plugins/withGardeAdresseServeur.js) au dossier android/ DÉJÀ généré, sans refaire `expo prebuild`.
// À lancer une fois : pnpm --filter mobile garde-apk   (lancé aussi par le script "prebuild").
const fs = require("fs");
const path = require("path");
const { ajouterGarde } = require("../plugins/withGardeAdresseServeur");

const fichier = path.join(__dirname, "..", "android", "app", "build.gradle");
if (!fs.existsSync(fichier)) {
  console.log("Pas de dossier android/ : rien à faire (la garde sera ajoutée au prochain `expo prebuild`).");
  process.exit(0);
}
const avant = fs.readFileSync(fichier, "utf8");
const apres = ajouterGarde(avant);
if (apres === avant) console.log("La garde est déjà en place.");
else {
  fs.writeFileSync(fichier, apres);
  console.log("Garde ajoutée à android/app/build.gradle : un APK release sans EXPO_PUBLIC_API_URL en https sera refusé.");
}
