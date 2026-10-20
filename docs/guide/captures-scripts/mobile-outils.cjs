/**
 * Outils des scripts de captures sur l'application MOBILE (en plus de outils/mobile-web/mobile.cjs) : mesure d'un élément ou d'une carte,
 * réunion de mesures, défilement, navigation profonde dans « Plus », photo + repères écrits dans un fichier JSON.
 */
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const m = require("../outils/mobile-web/mobile.cjs");

const arrondi = (n) => Math.round(n * 1000) / 1000;

/**
 * Boîte d'un élément en fractions de l'écran. `carte: true` remonte jusqu'à la carte qui le contient (bord + coins arrondis),
 * pour entourer un bloc entier à partir de son titre.
 */
async function boite(page, loc, { carte = false } = {}) {
  const l = loc.first();
  if (!(await l.count())) return null;
  const b = await l.evaluate((e, carte) => {
    let x = e;
    if (carte) {
      for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderTopLeftRadius) >= 6) { x = n; break; }
      }
    }
    const r = x.getBoundingClientRect();
    return { x: r.x, y: r.y, l: r.width, h: r.height };
  }, carte);
  const v = page.viewportSize();
  return { x: arrondi(b.x / v.width), y: arrondi(b.y / v.height), l: arrondi(b.l / v.width), h: arrondi(b.h / v.height) };
}

/** Réunion de plusieurs boîtes (par ex. tous les onglets d'une barre). */
function union(bs) {
  const ok = bs.filter(Boolean);
  if (!ok.length) return null;
  const x0 = Math.min(...ok.map((b) => b.x)), y0 = Math.min(...ok.map((b) => b.y));
  const x1 = Math.max(...ok.map((b) => b.x + b.l)), y1 = Math.max(...ok.map((b) => b.y + b.h));
  return { x: arrondi(x0), y: arrondi(y0), l: arrondi(x1 - x0), h: arrondi(y1 - y0) };
}

/** Réunion des boîtes de plusieurs locators. */
const unionDe = (page, locs, opts) => async () => union(await Promise.all(locs.map((l) => boite(page, l, opts))));

/** Amène un élément à l'écran (`center`, `start`, `end`) : le contenu défile dans son propre conteneur. */
async function centrer(loc, bloc = "center") {
  if (!(await loc.first().count())) return;
  await loc.first().evaluate((e, bloc) => e.scrollIntoView({ block: bloc }), bloc);
  await loc.page().waitForTimeout(500);
}

/** Décale tous les conteneurs défilants (positif = vers le bas). */
async function decaler(page, dy) {
  await page.evaluate((dy) => document.querySelectorAll("div").forEach((d) => { if (d.scrollHeight > d.clientHeight + 4) d.scrollTop += dy; }), dy);
  await page.waitForTimeout(400);
}

async function haut(page) {
  await page.evaluate(() => document.querySelectorAll("div").forEach((d) => { if (d.scrollTop) d.scrollTop = 0; }));
  await page.waitForTimeout(300);
}

async function taille(page, hauteur) {
  await page.setViewportSize({ width: 390, height: hauteur });
  await page.waitForTimeout(700);
}

/**
 * Ouvre un onglet du bas ou une entrée de « Plus » en remontant les écrans ouverts dedans (fiche, sous-écran…).
 * `repere(page)` (facultatif) : élément visible seulement sur la liste de l'onglet, pour savoir quand s'arrêter de remonter.
 */
async function aller(page, libelle, repere) {
  await m.fermerTiroir(page);
  const onglet = page.getByRole("tab", { name: libelle, exact: true });
  if (await onglet.count()) {
    await onglet.first().click();
    await m.attendreChargement(page);
    const r = repere?.(page);
    for (let i = 0; i < 4 && r && !(await r.isVisible().catch(() => false)); i++) await m.retour(page);
    return;
  }
  await m.aller(page, libelle);
}

/**
 * Appareil photo : `cap(page, nom, mesures)` mesure puis photographie `nom.png` (dans m.SORTIE) et range les mesures dans `fichier`
 * sous la clé `nom`. `mesures` = { cle: locator | [locator, options de boite] | fonction async → boîte }.
 */
function appareil(fichier) {
  const reperes = existsSync(fichier) ? JSON.parse(readFileSync(fichier, "utf8")) : {};
  return async function cap(page, nom, mesures = {}) {
    await m.attendreChargement(page, { delai: 6000 });
    const r = {};
    for (const [cle, quoi] of Object.entries(mesures)) {
      let b = null;
      try {
        if (typeof quoi === "function") b = await quoi();
        else if (Array.isArray(quoi)) b = await boite(page, quoi[0], quoi[1]);
        else b = await boite(page, quoi);
      } catch {
        b = null;
      }
      if (b && b.y >= 0 && b.y + b.h <= 1.001) r[cle] = b;
      else console.log(`  !! repère absent ou hors écran : ${nom}/${cle}`);
    }
    reperes[nom] = r;
    writeFileSync(fichier, JSON.stringify(reperes, null, 1));
    await m.photo(page, nom);
    console.log("  capture", nom);
  };
}

/** Contexte téléphone dont les appels vers l'hôte compilé (40401, 40402, 40403) vont à l'hôte `base` (base+1, +2, +3). */
async function contexteVers(nav, base, options = {}) {
  const ctx = await m.contexte(nav, options);
  if (base !== 40400) {
    await ctx.route(/^http:\/\/127\.0\.0\.1:(40401|40402|40403)\//, (route) => {
      const adresse = route.request().url().replace(/127\.0\.0\.1:404(\d\d)/, (_, n) => `127.0.0.1:${base + Number(n)}`);
      return route.continue({ url: adresse });
    });
  }
  return ctx;
}

module.exports = { m, boite, union, unionDe, centrer, decaler, haut, taille, aller, appareil, contexteVers };
