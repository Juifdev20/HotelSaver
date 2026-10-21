#!/usr/bin/env node
/**
 * Lit env.local à la racine et génère tous les fichiers .env du monorepo.
 * Usage : node scripts/distribuer-env.mjs
 *
 * Voir env.local.example pour le modèle à copier.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const SOURCE = join(RACINE, "env.local");

if (!existsSync(SOURCE)) {
  console.error("❌ env.local absent — copier env.local.example en env.local et le remplir.");
  process.exit(1);
}

// Lecture de env.local
const vars = {};
for (const ligne of readFileSync(SOURCE, "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(ligne);
  if (m) vars[m[1]] = m[2].trim();
}

function requis(nom) {
  if (!vars[nom]) { console.error(`❌ ${nom} manquant dans env.local`); process.exit(1); }
  return vars[nom];
}
function opt(nom, defaut = "") { return vars[nom] || defaut; }

// ── packages/database/.env.test ──────────────────────────────────────────────
ecrire("packages/database/.env.test", [
  `DATABASE_URL=${requis("TEST_DATABASE_URL")}`,
  `SUPABASE_URL=${requis("TEST_SUPABASE_URL")}`,
  `SUPABASE_SERVICE_ROLE_KEY=${requis("TEST_SUPABASE_SERVICE_ROLE_KEY")}`,
]);

// ── packages/database/.env.prod ──────────────────────────────────────────────
ecrire("packages/database/.env.prod", [
  `DATABASE_URL=${requis("PROD_DATABASE_URL")}`,
  `SUPABASE_URL=${requis("PROD_SUPABASE_URL")}`,
  `SUPABASE_SERVICE_ROLE_KEY=${requis("PROD_SUPABASE_SERVICE_ROLE_KEY")}`,
]);

// ── apps/api/.env ─────────────────────────────────────────────────────────────
ecrire("apps/api/.env", [
  `DATABASE_URL=${requis("TEST_DATABASE_URL")}`,
  `SUPABASE_URL=${requis("TEST_SUPABASE_URL")}`,
  `SUPABASE_ANON_KEY=${requis("TEST_SUPABASE_ANON_KEY")}`,
  `SUPABASE_SERVICE_ROLE_KEY=${requis("TEST_SUPABASE_SERVICE_ROLE_KEY")}`,
  "",
  "PORT=3000",
  "NODE_ENV=development",
  "CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://localhost:5175",
  "",
  "SITE_WEB_URL=http://localhost:5175",
  "",
  `RENDER_API_KEY=${opt("RENDER_API_KEY")}`,
  `RENDER_WEB_SERVICE_ID=${opt("RENDER_WEB_SERVICE_ID")}`,
  "",
  `TURNSTILE_SECRET=${opt("TURNSTILE_SECRET")}`,
  "",
  `LINKPAY_API_URL=${opt("LINKPAY_API_URL")}`,
  `LINKPAY_NUMERO_MARCHAND=${opt("LINKPAY_NUMERO_MARCHAND")}`,
  `LINKPAY_SITE_URL=${opt("LINKPAY_SITE_URL")}`,
  `ACOMPTE_CARTE=true`,
]);

// ── apps/super-admin/.env ────────────────────────────────────────────────────
ecrire("apps/super-admin/.env", [
  "VITE_API_URL=http://localhost:3000",
  `VITE_SUPABASE_URL=${requis("TEST_SUPABASE_URL")}`,
  `VITE_SUPABASE_ANON_KEY=${requis("TEST_SUPABASE_ANON_KEY")}`,
]);

// ── apps/web/.env ─────────────────────────────────────────────────────────────
ecrire("apps/web/.env", [
  "VITE_API_URL=http://localhost:3001",
  "",
  `VITE_URL_PLAY_STORE=${opt("VITE_URL_PLAY_STORE")}`,
  `VITE_URL_APP_STORE=${opt("VITE_URL_APP_STORE")}`,
  `VITE_URL_WINDOWS=${opt("VITE_URL_WINDOWS")}`,
  `VITE_URL_ANDROID_APK=${opt("VITE_URL_ANDROID_APK")}`,
  `VITE_URL_SCANLINKPAY=${opt("VITE_URL_SCANLINKPAY")}`,
  `VITE_TURNSTILE_SITE_KEY=${opt("VITE_TURNSTILE_SITE_KEY")}`,
]);

console.log("✅ Tous les fichiers .env ont été générés.");
console.log("   Lancez maintenant : node scripts/verifier-env.mjs");

function ecrire(chemin, lignes) {
  const fichier = join(RACINE, chemin);
  writeFileSync(fichier, lignes.join("\n") + "\n", "utf8");
  console.log(`   ✔ ${chemin}`);
}
