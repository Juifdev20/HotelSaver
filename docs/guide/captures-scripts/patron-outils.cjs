/**
 * Outils communs des scripts de captures du guide « patron » : connexion par numéro de téléphone (comme l'application), base de
 * démonstration (psql), photo d'un élément, etc. L'hôte se lance avec `patron-hote.sh demarrer` (API 40001, application 40003,
 * faux ScanLinkPay 40010, site web 40020) ; les scripts se lancent avec GUIDE_PORT_BASE=40000.
 */
const { execFileSync } = require("node:child_process");
const L = require("../outils/lib.cjs");

const TELEPHONES = { patron: "970000001", recep: "970000002", caf: "970000003" };

/** Exécute du SQL sur la base de démonstration (hotel_t). */
function sql(requete) {
  return execFileSync("psql", ["-U", "postgres", "-h", "/tmp", "-p", "54330", "-d", "hotel_t", "-At", "-c", requete], { encoding: "utf8" }).trim();
}

/** Page vierge (écran de connexion) dans un contexte téléphone. */
async function pageConnexion(ctx) {
  const page = await ctx.newPage();
  await page.goto(L.HOTE.site);
  await page.waitForTimeout(1800);
  return page;
}

/** Connexion par numéro de téléphone. */
async function seConnecter(page, role = "patron") {
  await page.getByPlaceholder("970 000 000").fill(TELEPHONES[role]);
  await page.getByPlaceholder("Votre mot de passe").fill("motdepasse-test");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForTimeout(3800);
}

async function ouvrirSession(ctx, role = "patron") {
  const page = await pageConnexion(ctx);
  await seConnecter(page, role);
  return page;
}

/** Ouvre une rubrique par la barre du bas ou le tiroir, puis attend que la liste soit chargée. */
async function aller(page, libelle, attente = 1800) {
  await L.aller(page, libelle);
  await page.waitForTimeout(attente);
}

/** Remonte tout en haut de la page (l'application défile dans la fenêtre). */
async function haut(page) {
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll("main, .coquille__contenu").forEach((e) => (e.scrollTop = 0)); });
  await page.waitForTimeout(300);
}

/** Fait défiler pour amener un élément (texte) vers le haut de l'écran, puis photographie la fenêtre. */
async function defiler(page, locator, decalage = 90) {
  await locator.first().scrollIntoViewIfNeeded();
  await page.evaluate((d) => window.scrollBy(0, -d), decalage);
  await page.waitForTimeout(500);
}

const fs = require("node:fs");
const path = require("node:path");
const FICHIER_REPERES = path.join(L.SORTIE, "patron-reperes.json");

/** Mesure un élément (fractions de la capture) et le range dans patron-reperes.json sous « capture/nom » : à recopier dans `reperes` du guide. */
async function mes(page, capture, nom, locator, options) {
  const r = await L.mesurer(page, locator, options);
  const tout = fs.existsSync(FICHIER_REPERES) ? JSON.parse(fs.readFileSync(FICHIER_REPERES, "utf8")) : {};
  tout[capture] = tout[capture] ?? {};
  tout[capture][nom] = r;
  fs.writeFileSync(FICHIER_REPERES, JSON.stringify(tout, null, 1));
  return r;
}

module.exports = { mes, ...L, sql, TELEPHONES, pageConnexion, seConnecter, ouvrirSession, aller, haut, defiler };
