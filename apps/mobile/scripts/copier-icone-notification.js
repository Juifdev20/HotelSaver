// Copie l'icône de notification (silhouette blanche du logo, fond transparent) dans le dossier android/ DÉJÀ généré, sans refaire `expo prebuild`.
// Android n'utilise que la FORME (la transparence) de la petite icône d'une notification : l'ancienne icône était un carré blanc plein, d'où une
// place vide à gauche de chaque notification (écran verrouillé compris). Le plugin expo-notifications (app.json, option `icon`) fait la même copie à
// chaque `expo prebuild`. À lancer une fois : pnpm --filter mobile icone-notification   (lancé aussi par le script "prebuild").
const fs = require("fs");
const path = require("path");

const DENSITES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
const racine = path.join(__dirname, "..");

if (!fs.existsSync(path.join(racine, "android"))) {
  console.log("Pas de dossier android/ : rien à faire (le plugin expo-notifications copiera l'icône au prochain `expo prebuild`).");
  process.exit(0);
}
for (const densite of DENSITES) {
  const dossier = path.join(racine, "android", "app", "src", "main", "res", `drawable-${densite}`);
  fs.mkdirSync(dossier, { recursive: true });
  fs.copyFileSync(path.join(racine, "assets", "icone-notification", `drawable-${densite}`, "notification_icon.png"), path.join(dossier, "notification_icon.png"));
  console.log(`Icône copiée : res/drawable-${densite}/notification_icon.png`);
}
