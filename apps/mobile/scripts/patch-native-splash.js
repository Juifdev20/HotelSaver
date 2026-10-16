// Complète withSurfaceTranslucide.js après `expo prebuild`, en patchant
// directement `Theme.App.SplashScreen` : ce style est régénéré par
// expo-splash-screen à une étape fixe de `expo prebuild`, plus tardive que
// n'importe quel mod de plugin de config — testé : un item poussé depuis un
// plugin (`withAndroidStyles` ou `withDangerousMod`, quelle que soit sa
// position dans `app.json`) est systématiquement écrasé. D'où ce script, lancé
// une fois `expo prebuild` terminé (voir le script "prebuild" du package.json).
//
// 1. Splash système = même logo, même taille, même place (15/10/2026) : sur
//    Android 12+, ce splash est imposé à chaque lancement et couvre tout le
//    démarrage à froid du processus (plusieurs secondes en APK de debug).
//    Avec l'icône d'expo il faisait un « gros logo » distinct ; sans icône, un
//    bleu vide. Il affiche donc `splash_demarrage` : canevas 288 dp (taille
//    imposée par l'OS, seul le cercle central de 192 dp est visible) avec le
//    logo de 128 dp au centre — exactement le logo du voile (MainActivity) et
//    de « Veuillez patienter » (App.tsx). Les PNG par densité vivent dans
//    assets/splash-demarrage/ (générés une fois) et sont recopiés ici.
// 2. `android:windowDisablePreview` : supprime la Starting Window des Android
//    antérieurs à 12 (icône ~288 dp, le « fantôme » pendant le fondu).
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

const res = path.dirname(path.dirname(stylesPath));
for (const densite of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
  const dossier = path.join(res, `drawable-${densite}`);
  fs.mkdirSync(dossier, { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, "..", "assets", "splash-demarrage", `splash_demarrage-${densite}.png`),
    path.join(dossier, "splash_demarrage.png")
  );
}

let contents = fs.readFileSync(stylesPath, "utf8");

const cible = /(<style name="Theme\.App\.SplashScreen"[^>]*>)/;
if (!cible.test(contents)) {
  throw new Error(
    "patch-native-splash: Theme.App.SplashScreen introuvable dans styles.xml — expo-splash-screen a-t-il changé de format ?"
  );
}

contents = contents
  .replace(
    /(<item name="windowSplashScreenAnimatedIcon">)[^<]*(<\/item>)/,
    "$1@drawable/splash_demarrage$2"
  )
  .replace(/\s*<item name="android:windowSplashScreenBehavior">[^<]*<\/item>/, "");

if (!contents.includes("android:windowDisablePreview")) {
  contents = contents.replace(
    cible,
    `$1\n    <item name="android:windowDisablePreview">true</item>`
  );
}

fs.writeFileSync(stylesPath, contents, "utf8");
console.log("patch-native-splash : splash système sur splash_demarrage + windowDisablePreview sur Theme.App.SplashScreen");
