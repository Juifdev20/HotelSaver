import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Politique de sécurité du contenu, ajoutée à la page SEULEMENT dans la version construite (le serveur de développement Vite a besoin de
 * scripts en ligne pour son rechargement à chaud). Pas de script en ligne ni externe ;
 * connexions vers l'API et Supabase (https) et vers une API locale en développement.
 * (`frame-ancestors` ne peut pas se poser par une balise : à ajouter en en-tête HTTP chez l'hébergeur — voir DECISIONS.md.)
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-src 'none'",
].join("; ");

const pluginCsp = {
  name: "hotelsaver-csp",
  transformIndexHtml(html: string, contexte: { server?: unknown }) {
    return html.replace("<!--CSP-->", contexte.server ? "" : `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
  },
};

export default defineConfig({
  plugins: [react(), pluginCsp],
  server: { port: 5174 },
});
