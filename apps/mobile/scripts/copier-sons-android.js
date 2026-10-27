// Copie les sonneries des alertes de stock (la voix) dans le dossier android/ DÉJÀ généré, sans refaire `expo prebuild` : sans elles, le canal
// de notification « Stock bas » n'aurait pas son (res/raw). Le plugin expo-notifications (app.json, option `sounds`) fait la même copie à
// chaque `expo prebuild`. À lancer une fois : pnpm --filter mobile sons-android   (lancé aussi par le script "prebuild").
const fs = require("fs");
const path = require("path");

const SONS = ["stock_bas.mp3", "stock_epuise.mp3"];
const racine = path.join(__dirname, "..");
const destination = path.join(racine, "android", "app", "src", "main", "res", "raw");

if (!fs.existsSync(path.join(racine, "android"))) {
  console.log("Pas de dossier android/ : rien à faire (le plugin expo-notifications copiera les sons au prochain `expo prebuild`).");
  process.exit(0);
}
fs.mkdirSync(destination, { recursive: true });
for (const son of SONS) {
  fs.copyFileSync(path.join(racine, "assets", "sons", son), path.join(destination, son));
  console.log(`Son copié : res/raw/${son}`);
}
