import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
      },
    },
    plugins: [react()],
    // Serveur de développement local uniquement : les paquets (ex. la police Inter) vivent dans le
    // magasin pnpm, hors du dossier de l'app, et Vite répondait 403. Sans effet sur le build.
    server: { fs: { strict: false } },
  },
});
