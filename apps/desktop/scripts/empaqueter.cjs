// Installateur Windows du bureau (18/10/2026) : `pnpm --filter @hotel-chicago/desktop empaqueter`.
//
// 1. Construit l'application avec l'adresse de l'API et le projet Supabase de PRODUCTION (modifiables par variables
//    d'environnement, voir .env.example). Le processus principal regroupe toutes ses dépendances (electron.vite.config.ts).
// 2. Prépare un dossier propre (hors du dépôt, dans le dossier temporaire) : out/, resources/ et un package.json minimal, SANS dépendances — rien du
//    monorepo ni de node_modules n'entre dans l'installateur.
// 3. electron-builder fabrique l'installateur NSIS dans release/ : HotelSaver-Setup-<version>.exe.
//
// Non signé pour l'instant (pas de certificat de signature de code) : Windows SmartScreen affiche « Windows a protégé
// votre ordinateur » au premier lancement → « Informations complémentaires » → « Exécuter quand même ».
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const RACINE = path.join(__dirname, "..");
// Hors du monorepo : electron-builder cherche les node_modules du projet avec le gestionnaire de paquets détecté, et
// `pnpm list` échoue dans un dossier du dépôt qui n'est pas un paquet du workspace.
const ETAPE = path.join(os.tmpdir(), "hotelsaver-bureau");
const SORTIE = path.join(RACINE, "release");
const paquet = require(path.join(RACINE, "package.json"));
const versionElectron = require(require.resolve("electron/package.json", { paths: [RACINE] })).version;

const PRODUCTION = {
  MAIN_VITE_API_URL: "https://hotelsaver-api.onrender.com",
  MAIN_VITE_SUPABASE_URL: "https://axeznwmwupcgmhuajvte.supabase.co",
  MAIN_VITE_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4ZXpud213dXBjZ21odWFqdnRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyNjc4NTQsImV4cCI6MjEwNzg0Mzg1NH0.I8rPaUk91q7uh6WCHIhLINH6F0MqeuFepszsrM8zDGY",
};
// Une valeur déjà présente dans l'environnement l'emporte (ex. construire un installateur branché sur Test).
const env = { ...process.env };
for (const [cle, valeur] of Object.entries(PRODUCTION)) env[cle] = process.env[cle] || valeur;

async function main() {
  console.log(`API : ${env.MAIN_VITE_API_URL}\nSupabase : ${env.MAIN_VITE_SUPABASE_URL}\n`);
  execSync("npx electron-vite build", { cwd: RACINE, env, stdio: "inherit" });

  const principal = fs.readFileSync(path.join(RACINE, "out/main/index.js"), "utf8");
  if (!principal.includes(env.MAIN_VITE_API_URL)) throw new Error("L'adresse de l'API n'est pas dans le build : arrêt.");

  fs.rmSync(ETAPE, { recursive: true, force: true });
  fs.mkdirSync(ETAPE, { recursive: true });
  fs.cpSync(path.join(RACINE, "out"), path.join(ETAPE, "out"), { recursive: true });
  fs.cpSync(path.join(RACINE, "resources"), path.join(ETAPE, "resources"), { recursive: true });
  fs.writeFileSync(
    path.join(ETAPE, "package.json"),
    JSON.stringify(
      {
        name: "hotelsaver",
        productName: "HotelSaver",
        version: paquet.version,
        description: "HotelSaver — gestion hôtelière (réception, cafétaria, abonnement)",
        author: "HotelSaver",
        main: "out/main/index.js",
      },
      null,
      2,
    ),
  );

  // Lancé par « pnpm empaqueter » : sans ceci electron-builder croit à un projet pnpm et lance `pnpm list` dans le dossier
  // préparé (sans dépendances) — il retombe alors sur npm, qui ne trouve rien à embarquer, comme voulu.
  delete process.env.npm_config_user_agent;
  delete process.env.npm_execpath;
  const { build, Platform } = require("electron-builder");
  const fichiers = await build({
    targets: Platform.WINDOWS.createTarget(["nsis"], 1 /* x64 */),
    projectDir: ETAPE,
    config: {
      appId: "com.hotelsaver.bureau",
      productName: "HotelSaver",
      copyright: `© ${new Date().getFullYear()} HotelSaver`,
      electronVersion: versionElectron,
      npmRebuild: false,
      asar: true,
      directories: { output: SORTIE },
      files: ["out/**/*", "resources/**/*", "package.json"],
      win: { icon: "resources/icon.ico", artifactName: "HotelSaver-Setup-${version}.${ext}" },
      nsis: {
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: "HotelSaver",
        installerIcon: "resources/icon.ico",
        uninstallerIcon: "resources/icon.ico",
        uninstallDisplayName: "HotelSaver",
        language: "1036",
      },
    },
  });
  console.log("\nInstallateur :", fichiers.filter((f) => f.endsWith(".exe")).join(", "));
}

main().catch((e) => {
  console.error("\nÉchec :", e.message);
  process.exit(1);
});
