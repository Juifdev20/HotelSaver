/**
 * Outils de captures de l'interface MOBILE du guide (Playwright, Node simple) : même API que `../lib.cjs` (celui de l'application bureau),
 * mais sur l'application mobile (apps/mobile) compilée pour le web par ce dossier. L'hôte et le service mobile doivent tourner
 * (`mobile-web/demarrer.sh <portBase> <base>`). Ports : GUIDE_PORT_BASE (40400 par défaut) + 1 = API, + 2 = authentification,
 * + 3 = application bureau, + 4 = application mobile (ce dossier).
 *
 *   const m = require("./mobile.cjs");
 *   const nav = await m.navigateur();
 *   const ctx = await m.contexte(nav);                 // téléphone 390 x 844, définition x2, mode clair
 *   const page = await m.connecter(ctx, "patron");     // "patron" | "recep" | "caf"
 *   await m.aller(page, "Chambres");                   // onglet du bas, sinon entrée de l'écran « Plus »
 *   await m.photo(page, "patron-chambres");            // -> SORTIE/patron-chambres.png
 *
 * MODE SOMBRE : l'application mobile n'en a PAS (voir README.md) — toutes ses couleurs sont fixes (tokens.ts). `contexte(nav, { sombre: true })`
 * règle bien `prefers-color-scheme: dark` (si un jour l'application le suit, les captures le montreront) mais ne change rien à
 * l'écran aujourd'hui ; `basculerSombre(page)` cherche une bascule dans l'interface et lève une erreur claire quand il n'y en a pas.
 */
const { createRequire } = require("node:module");
const { join } = require("node:path");
const { mkdirSync } = require("node:fs");

const requireApi = createRequire(join(__dirname, "../../../../apps/api/package.json"));
const { chromium } = requireApi("playwright-core");

const BASE = Number(process.env.GUIDE_PORT_BASE ?? 40400);
const HOTE = {
  api: `http://127.0.0.1:${BASE + 1}`,
  auth: `http://127.0.0.1:${BASE + 2}`,
  bureau: `http://127.0.0.1:${BASE + 3}/`,
  site: `http://127.0.0.1:${BASE + 4}/`,
};
const MOT_DE_PASSE = "motdepasse-test";
/** Dossier des images (GUIDE_SORTIE pour le changer) : à côté de celui du bureau (captures/brut) pour ne pas mélanger les deux. */
const SORTIE = process.env.GUIDE_SORTIE ?? join(__dirname, "../../captures/brut-mobile");
mkdirSync(SORTIE, { recursive: true });

/** L'application mobile n'a pas de mode sombre (constaté dans apps/mobile : aucune lecture du thème, couleurs de tokens.ts fixes). */
const MODE_SOMBRE_MOBILE = false;

async function navigateur() {
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
}

const options = new WeakMap();

/**
 * Contexte « téléphone » (390 × 844, définition ×2). Options :
 *   largeur, hauteur, echelle  : dimensions et définition ;
 *   sombre                     : `prefers-color-scheme: dark` (sans effet visible aujourd'hui, voir plus haut) ;
 *   barreEtat (true)           : barre d'état et barre de gestes Android simulées (heure, réseau, batterie) ; false = les retirer ;
 *   haut, bas (28, 16)         : marges de sécurité en dp (barre d'état, barre de gestes), vues par l'application comme sur un téléphone ;
 *   heure ("9:41")             : fige l'heure AFFICHÉE dans la barre d'état simulée (l'horloge du tableau de bord reste celle du poste) ;
 *   imprimantes                : [{ name, address }] simule des imprimantes Bluetooth DÉJÀ APPAIRÉES (écran Imprimante) ; absent = Bluetooth éteint.
 */
async function contexte(nav, { largeur = 390, hauteur = 844, echelle = 2, sombre = false, barreEtat = true, haut = 28, bas = 16, heure = null, imprimantes = null } = {}) {
  if (sombre && !MODE_SOMBRE_MOBILE) console.warn("[mobile.cjs] Mode sombre demandé : l'application mobile n'a pas de mode sombre, l'affichage restera clair.");
  const ctx = await nav.newContext({
    viewport: { width: largeur, height: hauteur },
    deviceScaleFactor: echelle,
    locale: "fr-FR",
    timezoneId: "Africa/Lubumbashi",
    colorScheme: sombre ? "dark" : "light",
  });
  if (imprimantes) await ctx.addInitScript(`window.__HS_BLUETOOTH__ = ${JSON.stringify({ actif: true, appareils: imprimantes })};`);
  options.set(ctx, { barreEtat, haut, bas, heure });
  return ctx;
}

/** Adresse de l'application selon les options du contexte. */
function adresse(ctx) {
  const o = options.get(ctx) ?? { barreEtat: true, haut: 28, bas: 16 };
  return `${HOTE.site}?haut=${o.haut}&bas=${o.bas}${o.barreEtat ? "" : "&barre=0"}${o.heure ? `&heure=${encodeURIComponent(o.heure)}` : ""}`;
}

/** Ouvre l'application (écran de connexion) sans se connecter. */
async function ouvrir(ctx) {
  const page = await ctx.newPage();
  await page.goto(adresse(ctx));
  await page.getByText("Ravi de vous revoir !").waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  return page;
}

/** Ouvre l'application et se connecte (role : "patron" | "recep" | "caf"). */
async function connecter(ctx, role, opts) {
  const page = await ouvrir(ctx);
  await entrer(page, role, opts);
  return page;
}

/** Numéros des comptes de démonstration quand l'hôte est lancé avec GUIDE_TELEPHONES=1 (saisie « 970 000 001 », indicatif +243 déjà affiché). */
const TELEPHONES = { patron: "970000001", recep: "970000002", caf: "970000003" };

/**
 * Saisit l'identifiant et le mot de passe de démonstration puis attend l'accueil. Par défaut par l'e-mail « gl-<role>@exemple.test »
 * (lien « Ancien compte ? »), car les comptes de démonstration n'ont pas de numéro ; avec `{ telephone: true }` (ou GUIDE_TELEPHONES=1) par le
 * NUMÉRO, comme un vrai utilisateur : l'hôte doit alors avoir été lancé avec GUIDE_TELEPHONES=1 (voir README).
 */
async function entrer(page, role, { telephone = process.env.GUIDE_TELEPHONES === "1" } = {}) {
  if (telephone) {
    await page.getByPlaceholder("Numéro de téléphone").fill(TELEPHONES[role]);
  } else {
    const champ = page.getByRole("textbox", { name: "Adresse e-mail *" });
    if (!(await champ.isVisible().catch(() => false))) await page.getByText("Ancien compte ? Se connecter avec un e-mail").click();
    await champ.fill(`gl-${role}@exemple.test`);
  }
  await page.getByRole("textbox", { name: "Mot de passe *" }).fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.getByRole("tab", { name: "Accueil" }).waitFor({ timeout: 20000 });
  await attendreChargement(page);
}

/** Attend la fin des indicateurs de chargement (et que la synchronisation initiale ait rempli l'écran). */
async function attendreChargement(page, { delai = 10000 } = {}) {
  await page.waitForTimeout(500);
  await page.waitForFunction(() => !document.querySelector('[role="progressbar"]'), null, { timeout: delai }).catch(() => {});
  await page.waitForTimeout(900);
}

/** Va à un écran : onglet du bas, sinon entrée de l'écran « Plus » (on y revient d'abord s'il le faut). */
async function aller(page, libelle) {
  await fermerTiroir(page);
  const onglet = page.getByRole("tab", { name: libelle, exact: true });
  if (await onglet.count()) await onglet.first().click();
  else {
    await page.getByRole("tab", { name: "Plus", exact: true }).click();
    await page.waitForTimeout(500);
    // « Plus » garde l'entrée ouverte précédemment : on revient à sa liste si besoin.
    let entree = page.getByRole("button", { name: libelle, exact: true });
    if (!(await entree.count())) {
      await retour(page);
      entree = page.getByRole("button", { name: libelle, exact: true });
    }
    await entree.first().click({ timeout: 6000 });
  }
  await attendreChargement(page);
}

/** Bouton « Retour » de l'écran affiché (en-têtes d'écran de « Plus »). */
async function retour(page) {
  const b = page.getByRole("button", { name: /^Retour/ });
  if (await b.count()) await b.first().click();
  await page.waitForTimeout(500);
}

/** Ferme un menu / une feuille ouverte (menu du compte, centre de notifications, feuille modale) par la touche Échap, sans effet sinon. */
async function fermerTiroir(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
}

async function photo(page, nom, opts = {}) {
  await attendreChargement(page, { delai: 6000 });
  await page.screenshot({ path: join(SORTIE, `${nom}.png`), ...opts });
}

/** Liste ce qui est cliquable / saisissable à l'écran : sert à écrire les scripts sans deviner (`horsEcran: true` : aussi ce qui est hors de la vue, plus bas dans la liste). */
async function inventaire(page, { horsEcran = false } = {}) {
  return page.evaluate((horsEcran) => {
    const visible = (e) => { if (e.closest("[aria-hidden=true]")) return false; const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && (horsEcran || (r.bottom > 0 && r.top < innerHeight)); };
    const nom = (e) => (e.getAttribute("aria-label") || e.innerText || e.getAttribute("placeholder") || e.id || "").replace(/\s+/g, " ").trim().slice(0, 70);
    const sortie = [];
    for (const e of document.querySelectorAll("button, a[href], [role=button], [role=tab], [role=menuitem], [role=switch], [role=checkbox], [role=radio], input, select, textarea")) {
      if (!visible(e)) continue;
      const role = e.getAttribute("role");
      sortie.push(`${e.tagName.toLowerCase()}${role ? "[" + role + "]" : ""}${e.type ? "(" + e.type + ")" : ""} « ${nom(e)} »`);
    }
    return sortie;
  }, horsEcran);
}

/** Fait défiler le contenu de l'écran de `dy` pixels (positif = vers le bas ; `Infinity` = jusqu'en bas ; `-Infinity` = retour en haut). */
async function defiler(page, dy) {
  const vue = page.viewportSize();
  await page.mouse.move(vue.width / 2, vue.height / 2);
  const pas = Number.isFinite(dy) ? dy : Math.sign(dy) * 20000;
  await page.mouse.wheel(0, pas);
  await page.waitForTimeout(400);
}

/**
 * Position exacte d'un élément sur la capture, en fractions (0 à 1) : { x, y, l, h } — à recopier dans `reperes` du guide.
 * Mesurer juste avant `photo()` (même défilement). `complet` = la capture est en pleine page (fullPage:true).
 */
async function mesurer(page, locator, { complet = false } = {}) {
  const b = await locator.first().boundingBox();
  if (!b) return null;
  const vue = page.viewportSize();
  const hauteur = complet ? await page.evaluate(() => document.documentElement.scrollHeight) : vue.height;
  const arrondi = (v) => Math.round(v * 1000) / 1000;
  return { x: arrondi(b.x / vue.width), y: arrondi(b.y / hauteur), l: arrondi(b.width / vue.width), h: arrondi(b.height / hauteur) };
}

/**
 * Bascule le mode sombre DANS l'application : il n'y a pas de telle bascule dans l'application mobile (ni dans Paramètres ni dans
 * l'en-tête ; le bureau en a une, pas le mobile). Lève une erreur explicite plutôt que de photographier du clair en le faisant passer
 * pour du sombre.
 */
async function basculerSombre(page) {
  if (!MODE_SOMBRE_MOBILE) throw new Error("L'application mobile HotelSaver n'a pas de mode sombre (couleurs fixes, tokens.ts) : rien à basculer.");
  await page.emulateMedia({ colorScheme: "dark" });
}

module.exports = { mesurer, TELEPHONES, HOTE, SORTIE, MODE_SOMBRE_MOBILE, navigateur, contexte, ouvrir, connecter, entrer, aller, retour, fermerTiroir, photo, inventaire, defiler, attendreChargement, basculerSombre };
