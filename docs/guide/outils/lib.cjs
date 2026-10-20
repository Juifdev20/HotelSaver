/**
 * Outils communs des scripts de captures du guide (Playwright, Node simple). L'hôte de démonstration doit tourner
 * (voir docs/guide/README.md). Ports : GUIDE_PORT_BASE (39900 par défaut) + 1 = API, + 2 = authentification, + 3 = application.
 */
const { createRequire } = require("node:module");
const { join } = require("node:path");
const { mkdirSync } = require("node:fs");

const requireApi = createRequire(join(__dirname, "../../../apps/api/package.json"));
const { chromium } = requireApi("playwright-core");

const BASE = Number(process.env.GUIDE_PORT_BASE ?? 39900);
const HOTE = { api: `http://127.0.0.1:${BASE + 1}`, auth: `http://127.0.0.1:${BASE + 2}`, site: `http://127.0.0.1:${BASE + 3}/` };
const MOT_DE_PASSE = "motdepasse-test";
const SORTIE = join(__dirname, "../captures/brut");
mkdirSync(SORTIE, { recursive: true });

async function navigateur() {
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
}

/** Contexte « téléphone » (390 × 844, définition ×2) ou « bureau » ({ largeur, hauteur }). */
async function contexte(nav, { largeur = 390, hauteur = 844, echelle = 2 } = {}) {
  const ctx = await nav.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: echelle, locale: "fr-FR", timezoneId: "Africa/Lubumbashi" });
  await ctx.addInitScript({
    content: `if (!localStorage.getItem("hotel-chicago:config-navigateur")) localStorage.setItem("hotel-chicago:config-navigateur", ${JSON.stringify(
      JSON.stringify({ apiUrl: HOTE.api, supabaseUrl: HOTE.auth, supabaseAnonKey: "anon", refreshToken: null, imprimanteInterface: null })
    )});`,
  });
  return ctx;
}

/** Ouvre l'application et se connecte (role : "patron" | "recep" | "caf"). */
async function connecter(ctx, role) {
  const page = await ctx.newPage();
  await page.goto(HOTE.site);
  await page.waitForTimeout(1500);
  await entrer(page, role);
  return page;
}

async function entrer(page, role) {
  const champ = page.getByLabel("Adresse e-mail");
  if (!(await champ.isVisible().catch(() => false))) await page.getByRole("button", { name: /Ancien compte \? Se connecter avec un e-mail/ }).click();
  await champ.fill(`gl-${role}@exemple.test`);
  await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForTimeout(3500);
}

/** Va à un écran : onglet du bas, sinon tiroir « Plus ». */
async function aller(page, libelle) {
  const bas = page.getByRole("navigation", { name: "Navigation rapide" });
  if (!(await bas.isVisible().catch(() => false))) await fermerTiroir(page);
  const direct = bas.getByRole("button", { name: libelle, exact: true });
  if (await direct.count()) await direct.first().click();
  else {
    await bas.getByRole("button", { name: /Plus/ }).click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: libelle, exact: true }).first().click({ timeout: 6000 });
  }
  await page.waitForTimeout(1800);
}

async function fermerTiroir(page) {
  const fermer = page.getByRole("button", { name: "Fermer le menu" });
  if (await fermer.isVisible().catch(() => false)) await fermer.click();
  await page.waitForTimeout(400);
}

async function photo(page, nom, options = {}) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(SORTIE, `${nom}.png`), ...options });
}

/** Liste ce qui est cliquable / saisissable à l'écran : sert à écrire les scripts sans deviner. */
async function inventaire(page) {
  return page.evaluate(() => {
    const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden"; };
    const nom = (e) => (e.getAttribute("aria-label") || e.innerText || e.getAttribute("placeholder") || e.id || "").replace(/\s+/g, " ").trim().slice(0, 70);
    const sortie = [];
    for (const e of document.querySelectorAll("button, a[href], [role=tab], [role=menuitem], input, select, textarea, [role=checkbox], [role=radio]")) {
      if (!visible(e)) continue;
      const lab = e.id ? document.querySelector(`label[for="${e.id}"]`)?.innerText : "";
      sortie.push(`${e.tagName.toLowerCase()}${e.type ? "[" + e.type + "]" : ""} « ${nom(e) || lab || ""} »${lab && nom(e) !== lab ? " (label: " + lab.trim() + ")" : ""}`);
    }
    return sortie;
  });
}

module.exports = { HOTE, SORTIE, navigateur, contexte, connecter, entrer, aller, fermerTiroir, photo, inventaire };
