#!/usr/bin/env node
/**
 * Vérifie les fichiers .env après une réinstallation (docs/RECONSTRUIRE-ENV.md), SANS jamais afficher une valeur :
 * seulement « présent / manquant / vide » et quelques contrôles de forme.
 *
 *   node scripts/verifier-env.mjs        (à la racine du dépôt)
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RACINE = new URL("..", import.meta.url).pathname;

/** Fichier → variables indispensables (les autres de .env.example sont facultatives). */
const FICHIERS = [
  { fichier: "apps/api/.env", requis: ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CORS_ORIGIN", "SITE_WEB_URL"], role: "API locale (projet Hotelsaver Test)" },
  { fichier: "packages/database/.env.test", requis: ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], role: "scripts de base — Test" },
  { fichier: "packages/database/.env.prod", requis: ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], role: "scripts de base — Prod" },
  { fichier: "apps/super-admin/.env", requis: ["VITE_API_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"], role: "super-admin" },
  { fichier: "apps/web/.env", requis: ["VITE_API_URL"], role: "site public" },
  { fichier: "apps/mobile/.env", requis: [], role: "mobile (vide = Test ; valeurs Prod seulement pour l'APK publiée)", facultatif: true },
  { fichier: "apps/desktop/.env", requis: [], role: "bureau (vide = Test ; valeurs Prod seulement pour l'installateur publié)", facultatif: true },
];

function lire(fichier) {
  const chemin = join(RACINE, fichier);
  if (!existsSync(chemin)) return null;
  const vars = {};
  for (const ligne of readFileSync(chemin, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(ligne);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return vars;
}

/** Contrôles de forme, sans rien révéler. */
function remarques(nom, valeur) {
  const r = [];
  if (nom === "DATABASE_URL") {
    if (!/^postgres(ql)?:\/\//.test(valeur)) r.push("ne commence pas par postgresql://");
    if (!/:6543\//.test(valeur)) r.push("pas le pooler en mode transaction (port 6543)");
    if (/pgbouncer=true/.test(valeur)) r.push("retirer ?pgbouncer=true");
    if (/\[|\]|<|>/.test(valeur)) r.push("contient encore un modèle ([...] ou <...>)");
  }
  if (/SUPABASE_URL$/.test(nom) && !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(valeur)) r.push("forme attendue https://<ref>.supabase.co");
  if (/(ANON|SERVICE_ROLE)_KEY$/.test(nom) && !/^(eyJ|sb_)/.test(valeur)) r.push("ne ressemble pas à une clé Supabase");
  return r;
}

let problemes = 0;
const urls = {};
for (const { fichier, requis, role, facultatif } of FICHIERS) {
  const vars = lire(fichier);
  if (!vars) {
    if (facultatif) console.log(`·  ${fichier} — absent (facultatif : ${role})`);
    else { console.log(`❌ ${fichier} — ABSENT (${role}) : copier ${fichier.replace(/\.env(\.\w+)?$/, ".env.example")}`); problemes++; }
    continue;
  }
  const manquants = requis.filter((n) => !(n in vars));
  const vides = requis.filter((n) => n in vars && !vars[n]);
  const formes = Object.entries(vars).filter(([, v]) => v).flatMap(([n, v]) => remarques(n, v).map((m) => `${n} : ${m}`));
  const ok = !manquants.length && !vides.length && !formes.length;
  console.log(`${ok ? "✅" : "⚠️ "} ${fichier} — ${role}`);
  for (const n of manquants) console.log(`     manquante : ${n}`);
  for (const n of vides) console.log(`     vide      : ${n}`);
  for (const f of formes) console.log(`     à vérifier: ${f}`);
  if (!ok) problemes++;
  urls[fichier] = vars.SUPABASE_URL || vars.VITE_SUPABASE_URL || "";
}

// La machine de développement doit viser Test, jamais Prod.
const test = urls["packages/database/.env.test"], prod = urls["packages/database/.env.prod"];
if (test && prod && test === prod) { console.log("❌ .env.test et .env.prod visent le MÊME projet Supabase"); problemes++; }
if (prod && urls["apps/api/.env"] === prod) { console.log("❌ apps/api/.env vise le projet PROD : en local, il faut les valeurs de Hotelsaver Test"); problemes++; }
if (prod && urls["apps/super-admin/.env"] === prod) console.log("⚠️  apps/super-admin/.env vise PROD (normal seulement pour un build de déploiement)");

// La clé de signature Android : irremplaçable.
const sig = ["apps/mobile/signature/hotelsaver-release.keystore", "apps/mobile/signature/keystore.properties"];
const sigOk = sig.every((f) => existsSync(join(RACINE, f)));
console.log(sigOk ? "✅ apps/mobile/signature/ — clé de signature présente" : "❌ apps/mobile/signature/ — clé de signature ABSENTE (voir docs/RECONSTRUIRE-ENV.md, section « Clé de signature »)");
if (!sigOk) problemes++;

console.log(problemes ? `\n${problemes} point(s) à régler.` : "\nTout est en place.");
process.exitCode = problemes ? 1 : 0;
