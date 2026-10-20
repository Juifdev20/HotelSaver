// Compile le VRAI code de apps/mobile pour le navigateur (esbuild + react-native-web). Aucun fichier de l'application n'est modifié :
// les modules natifs sont remplacés à la résolution par les substituts de shims/.
//   node build.mjs            -> dist/ (index.html, app.js, polices)
// Variables lues (adresses de l'hôte de démonstration, injectées comme le fait Expo pour EXPO_PUBLIC_*) :
//   GUIDE_PORT_BASE (40400 par défaut) : API = +1, authentification = +2 ; ou EXPO_PUBLIC_API_URL / EXPO_PUBLIC_SUPABASE_URL explicites.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, "../../../..");
const MOBILE = join(RACINE, "apps/mobile");
const SHIMS = join(ICI, "shims");
const DIST = join(ICI, "dist");

const base = Number(process.env.GUIDE_PORT_BASE ?? 40400);
const env = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? `http://127.0.0.1:${base + 1}`,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? `http://127.0.0.1:${base + 2}`,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "anon",
  EXPO_PUBLIC_SITE_URL: process.env.EXPO_PUBLIC_SITE_URL ?? `http://127.0.0.1:${base + 3}`,
};

/** Substituts des modules natifs (nom du module -> fichier de shims/). */
const REMPLACEMENTS = {
  "@react-native-async-storage/async-storage": "async-storage.js",
  "react-native-safe-area-context": "safe-area-context.js",
  "react-native-bluetooth-classic": "bluetooth-classic.js",
  "expo-secure-store": "expo-secure-store.js",
  "expo-constants": "expo-constants.js",
  "expo-device": "expo-device.js",
  "expo-notifications": "expo-notifications.js",
  "expo-status-bar": "expo-status-bar.js",
  "expo-splash-screen": "expo-splash-screen.js",
  "expo-file-system": "expo-file-system.js",
  "expo-image-picker": "expo-image-picker.js",
  "expo-camera": "expo-camera.jsx",
  "expo-sqlite": "expo-sqlite.js",
};
const PAQUETS_LOCAUX = ["api-client", "types", "regles", "receipts", "sync-engine", "miroir-local"];

/** Fichier du code de l'application (et non d'une de ses bibliothèques). */
const estApp = (chemin) => chemin.startsWith(MOBILE + "/") && !chemin.includes("/node_modules/");

const plugin = {
  name: "hotelsaver-web",
  setup(b) {
    // `saute` : les résolutions faites par ce plugin lui-même ne le re-traversent pas (sinon boucle infinie).
    const resoudre = (chemin, resolveDir) => b.resolve(chemin, { resolveDir, kind: "import-statement", pluginData: { saute: true } });
    const sur = (filter, fn) => b.onResolve({ filter }, (a) => (a.pluginData?.saute ? undefined : fn(a)));
    // Le code de l'application, par un alias court (entree.js).
    sur(/^@app\//, (a) => resoudre(join(MOBILE, a.path.slice(5)), MOBILE));
    // Paquets du monorepo : les SOURCES (pas dist/, qui peut dater).
    sur(new RegExp(`^@hotel-chicago/(${PAQUETS_LOCAUX.join("|")})$`), (a) => ({ path: join(RACINE, "packages", a.path.split("/")[1], "src/index.ts") }));
    // Une seule copie de React, celle du harnais.
    sur(/^(react|react-dom)(\/.*)?$/, (a) => resoudre(a.path, ICI));
    sur(/^react-native-web(\/.*)?$/, (a) => resoudre(a.path, ICI));
    // react-native : react-native-web ; « en Android » pour le code de l'application.
    sur(/^react-native$/, (a) => ({ path: join(SHIMS, estApp(a.importer) ? "react-native.app.js" : "react-native.web.js") }));
    // Imports profonds de react-native (Libraries/…) : modules natifs sans objet sur le web.
    sur(/^react-native\//, () => ({ path: "vide", namespace: "vide" }));
    b.onLoad({ filter: /.*/, namespace: "vide" }, () => ({ contents: "export default {}; export const TurboModuleRegistry = { get: () => null, getEnforcing: () => ({}) }; export const codegenNativeComponent = () => () => null; export const codegenNativeCommands = () => ({});", loader: "js" }));
    // Modules natifs Expo & co.
    for (const [nom, fichier] of Object.entries(REMPLACEMENTS)) {
      sur(new RegExp(`^${nom.replace(/[/-]/g, "\\$&")}$`), () => ({ path: join(SHIMS, fichier) }));
    }
    // Stockage SQLite du mobile -> IndexedDB.
    sur(/\/stockage\/baseLocale$/, (a) => (estApp(a.importer) ? { path: join(SHIMS, "baseLocale.web.ts") } : undefined));
  },
};

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const define = {
  "process.env.NODE_ENV": '"production"',
  "process.env.EXPO_OS": '"android"',
  __DEV__: "false",
  global: "globalThis",
};
for (const [k, v] of Object.entries(env)) define[`process.env.${k}`] = JSON.stringify(v);

const resultat = await build({
  entryPoints: [join(ICI, "entree.js")],
  outfile: join(DIST, "app.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome120",
  jsx: "automatic",
  tsconfigRaw: { compilerOptions: { jsx: "react-jsx" } },
  resolveExtensions: [".web.tsx", ".web.ts", ".web.jsx", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".json"],
  mainFields: ["browser", "module", "main"],
  define,
  plugins: [plugin],
  loader: { ".png": "file", ".jpg": "file", ".jpeg": "file", ".webp": "file", ".gif": "file", ".ttf": "file", ".otf": "file" },
  assetNames: "assets/[name]-[hash]",
  publicPath: ".",
  logLevel: "error",
  minify: false,
  sourcemap: false,
  nodePaths: [join(ICI, "node_modules")],
});

// Page hôte : cadre téléphone, polices Roboto (police d'Android), barre d'état simulée.
mkdirSync(join(DIST, "fonts"), { recursive: true });
cpSync(join(ICI, "node_modules/@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2"), join(DIST, "fonts", "roboto-variable.woff2"));
writeFileSync(join(DIST, "index.html"), readFileSync(join(ICI, "index.html"), "utf8"));
writeFileSync(join(DIST, "env.json"), JSON.stringify(env, null, 2));
console.log("OK : dist/ prêt (API", env.EXPO_PUBLIC_API_URL + ")");
