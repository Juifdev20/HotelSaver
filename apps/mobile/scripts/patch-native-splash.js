// Complète withSurfaceTranslucide.js après `expo prebuild` : supprime la
// Starting Window système sur Android (icône affichée à une taille fixe
// ~288 dp, plus grande que notre voile/écran JS à 171 dp — le « fantôme »
// pendant le fondu de démarrage). L'attribut qui la supprime,
// `android:windowDisablePreview`, doit être posé sur `Theme.App.SplashScreen`,
// mais ce style est régénéré par expo-splash-screen à une étape fixe de
// `expo prebuild`, plus tardive que n'importe quel mod de plugin de config —
// testé : un item poussé depuis un plugin (`withAndroidStyles` ou
// `withDangerousMod`, quelle que soit sa position dans `app.json`) est
// systématiquement écrasé. On patche donc le fichier généré directement,
// une fois `expo prebuild` terminé (voir le script "prebuild" du package.json).
const fs = require("fs");
const path = require("path");

const stylesPath = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "src",
  "main",
  "res",
  "values",
  "styles.xml"
);

if (!fs.existsSync(stylesPath)) {
  // Prebuild iOS seul, ou android/ pas encore généré : rien à patcher.
  process.exit(0);
}

let contents = fs.readFileSync(stylesPath, "utf8");

if (contents.includes("android:windowDisablePreview")) {
  process.exit(0);
}

const cible = /(<style name="Theme\.App\.SplashScreen"[^>]*>)/;
if (!cible.test(contents)) {
  throw new Error(
    "patch-native-splash: Theme.App.SplashScreen introuvable dans styles.xml — expo-splash-screen a-t-il changé de format ?"
  );
}

contents = contents.replace(
  cible,
  `$1\n    <item name="android:windowDisablePreview">true</item>`
);

fs.writeFileSync(stylesPath, contents, "utf8");
console.log("patch-native-splash : android:windowDisablePreview ajouté à Theme.App.SplashScreen");
