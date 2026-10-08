import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react-swc";

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
    server: { fs: { strict: false } },
    optimizeDeps: {
      // Pré-bundler les packages workspace et les dépendances lourdes dès le
      // premier démarrage → mis en cache dans node_modules/.vite, démarrages
      // suivants quasi-instantanés.
      include: [
        "@hotel-chicago/ui",
        "@hotel-chicago/api-client",
        "@hotel-chicago/types",
        "@hotel-chicago/receipts",
        "lucide-react",
        "react",
        "react-dom",
      ],
    },
  },
});
