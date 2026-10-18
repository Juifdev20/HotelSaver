import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react-swc";
import paquet from "./package.json";

/**
 * Politique de sécurité du contenu, ajoutée à la page SEULEMENT dans la version construite (le serveur de développement Vite a besoin de
 * scripts en ligne pour son rechargement à chaud). Aucun script externe ni en ligne ; connexions vers l'API et Supabase (https), et vers
 * une API locale (développement). Les styles en ligne restent permis (React les utilise pour la mise en page).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join("; ");

const pluginCsp = {
  name: "hotelsaver-csp",
  transformIndexHtml(html: string, contexte: { server?: unknown }) {
    return html.replace("<!--CSP-->", contexte.server ? "" : `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
  },
};

/**
 * Processus principal et preload : TOUTES les dépendances sont regroupées dans out/ (18/10/2026), seuls `electron` et les modules de
 * Node restent externes. L'installateur (scripts/empaqueter.cjs) n'embarque donc aucun node_modules — rien de natif à recompiler
 * (imprimante : node-thermal-printer, JavaScript pur ; copie locale : IndexedDB dans le renderer).
 */
const toutRegrouper = externalizeDepsPlugin({ exclude: Object.keys(paquet.dependencies ?? {}) });

export default defineConfig({
  main: {
    plugins: [toutRegrouper],
  },
  preload: {
    plugins: [toutRegrouper],
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
      },
    },
    plugins: [react(), pluginCsp],
    server: { fs: { strict: false } },
    optimizeDeps: {
      // Pré-bundler les packages workspace et les dépendances lourdes dès le
      // premier démarrage → mis en cache dans node_modules/.vite, démarrages
      // suivants quasi-instantanés.
      include: [
        "@hotel-chicago/ui",
        "@hotel-chicago/api-client",
        "@hotel-chicago/miroir-local",
        "@hotel-chicago/sync-engine",
        "@hotel-chicago/types",
        "@hotel-chicago/receipts",
        "lucide-react",
        "react",
        "react-dom",
      ],
    },
  },
});
