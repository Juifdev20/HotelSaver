/** Outils communs aux scripts de captures du guide « réceptionniste ». */
const { createRequire } = require("node:module");
const { join } = require("node:path");
const { writeFileSync, readFileSync, existsSync } = require("node:fs");
const L = require("../outils/lib.cjs");
const { chromium } = createRequire(join(__dirname, "../../../apps/api/package.json"))("playwright-core");

/** Repères mesurés (fractions de la capture) : écrits dans captures/brut/reception-reperes.json, relus pour écrire le guide. */
const FICHIER_REPERES = join(L.SORTIE, "reception-reperes.json");
const reperes = existsSync(FICHIER_REPERES) ? JSON.parse(readFileSync(FICHIER_REPERES, "utf8")) : {};
async function noter(page, image, cle, locator, options) {
  const m = await L.mesurer(page, locator, options);
  reperes[image] = { ...(reperes[image] ?? {}), [cle]: m };
  writeFileSync(FICHIER_REPERES, JSON.stringify(reperes, null, 1));
  return m;
}

const CACHE_BARRE = 'nav[aria-label="Navigation rapide"]{display:none!important}';

/** Photographie sous le nom `reception-<nom>`. `long` : page entière, barre du bas masquée (sinon elle flotterait au milieu de l'image). */
async function cap(page, nom, { long = false, attente = 700 } = {}) {
  let style = null;
  if (long) style = await page.addStyleTag({ content: CACHE_BARRE });
  await page.waitForTimeout(attente);
  await L.photo(page, `reception-${nom}`, long ? { fullPage: true } : {});
  if (style) await style.evaluate((n) => n.remove());
  console.log("  capture", nom);
}

/** Ouvre l'application, se connecte comme réceptionniste (e-mail de démonstration) et attend l'accueil. */
async function ouvrir(options = {}) {
  // Navigateur en français : les champs date s'affichent « jj/mm/aaaa ».
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--lang=fr-FR"], env: { ...process.env, LANGUAGE: "fr_FR", LANG: "fr_FR.UTF-8" } });
  const ctx = await L.contexte(nav, options);
  const page = await L.connecter(ctx, "recep");
  await page.getByText("À jour", { exact: true }).first().waitFor({ timeout: 20000 });
  return { nav, ctx, page };
}

/** Attend que du texte soit affiché (liste chargée). */
async function attendre(page, texte, delai = 15000) {
  await page.getByText(texte).first().waitFor({ timeout: delai });
}

module.exports = { L, cap, ouvrir, attendre, noter, chromium };
