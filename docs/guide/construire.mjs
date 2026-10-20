/**
 * Fabrique le guide : assemble les chapitres (contenu/*.mjs), numérote, génère le sommaire, puis imprime en PDF avec Chromium.
 *
 *   node docs/guide/construire.mjs                       → sortie/Guide-HotelSaver-complet.pdf
 *   node docs/guide/construire.mjs --role patron         → sortie/Guide-HotelSaver-patron.pdf (commun + patron)
 *   node docs/guide/construire.mjs --apercu              → aussi une image PNG par page dans sortie/apercu-<nom> (pour relire)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LOGO, RACINE, chapitre, couverture, pageFinale, sommaire } from "./modele.mjs";

const args = process.argv.slice(2);
const option = (nom) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 ? (args[i + 1]?.startsWith("--") || args[i + 1] === undefined ? true : args[i + 1]) : null;
};
const roleDemande = option("role");
const apercu = args.includes("--apercu");
const imagesOriginales = args.includes("--images-originales");

const MODULES = ["commun", "patron", "reception", "cafetaria"];
const parties = [];
for (const nom of MODULES) {
  if (roleDemande && roleDemande !== true && nom !== "commun" && nom !== roleDemande) continue;
  try {
    parties.push((await import(pathToFileURL(join(RACINE, "contenu", `${nom}.mjs`)).href)).default);
  } catch (e) {
    if (e.code === "ERR_MODULE_NOT_FOUND" && String(e.message).includes(`${nom}.mjs`)) continue;
    throw e;
  }
}
const meta = JSON.parse(readFileSync(join(RACINE, "version.json"), "utf8"));
const roleUnique = roleDemande && roleDemande !== true ? parties.find((p) => p.id === roleDemande) : null;
const titreGuide = roleUnique ? roleUnique.guide : "Guide complet";

/* ---- 1. Liste à plat des pages, dans l'ordre ---- */
const pages = []; // { page: objet de modele, chap, partie }
const entreesSommaire = [];
let numeroChapitre = 0;
const lignesPartie = [];
for (const partie of parties) {
  lignesPartie.push({ partie: partie.titre });
  for (const chap of partie.chapitres) {
    numeroChapitre += 1;
    const debut = pages.length;
    if (chap.sansSeparateur !== true) pages.push({ page: chapitre({ numero: numeroChapitre, titre: chap.titre, role: partie.libelle, icone: partie.icone, points: chap.points }), chap: chap.titre, partie });
    for (const p of chap.pages) pages.push({ page: p, chap: chap.titre, partie });
    lignesPartie.push({ numero: numeroChapitre, titre: chap.titre, debut });
  }
}
const nbPagesSommaire = Math.ceil(lignesPartie.length / 19);
const premierePageContenu = 2 + nbPagesSommaire; // couverture = 1, sommaire ensuite
const total = premierePageContenu - 1 + pages.length + 1; // + page finale

/* ---- 2. Habillage : en-tête, pied de page, numéro ---- */
const entete = (chap, libelle) => `<div class="entete"><div class="entete__marque"><img src="${LOGO}" alt="">HotelSaver</div><div class="entete__chap"><i></i>${chap}</div></div>`;
/** Pied de page : numéro, trait, nom du guide, puis logo et mention de droits (toutes les pages sauf la couverture). */
const DROITS = "Copyright © 2026 HotelSaver. Tous droits réservés.";
const pied = (n, libelle) =>
  `<div class="pied"><span class="pied__num">${n}</span><span class="pied__ligne"></span><span class="pied__guide">${libelle}</span><span class="pied__droits"><img src="${LOGO}" alt="">${DROITS}</span></div>`;
const echappe = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const rendu = pages.map((e, i) => {
  const n = premierePageContenu + i;
  if (e.page.kind === "plein") return e.page.html.replace("{{PIED}}", pied(n, echappe(e.partie.guide)));
  const classe = e.page.variante === "pale" ? " page--pale" : e.page.variante === "bleu" ? " page--bleu" : "";
  return `<div class="page${classe}">${entete(echappe(e.chap), e.partie.libelle)}<div class="corps">${e.page.corps}</div>${pied(n, echappe(e.partie.guide))}</div>`;
});
const pageFin = pageFinale(meta.fin).html.replace("{{PIED}}", pied(premierePageContenu + pages.length, echappe(titreGuide)));

/* ---- 3. Sommaire (avec numéros de page) ---- */
const lignes = lignesPartie.map((l) => (l.partie ? l : { numero: l.numero, titre: l.titre, page: premierePageContenu + l.debut }));
const blocsSommaire = [];
for (let i = 0; i < lignes.length; i += 19) blocsSommaire.push(lignes.slice(i, i + 19));
const htmlSommaire = blocsSommaire.map((bloc, k) => sommaire(bloc).html.replace("{{PIED}}", pied(2 + k, echappe(titreGuide)))).join("");

const htmlCouverture = couverture({ ...meta.couverture, titre: roleUnique ? roleUnique.guide : meta.couverture.titre, version: meta.version, date: meta.date }).html;

/* ---- 4. Assemblage ---- */
const css = readFileSync(join(RACINE, "guide.css"), "utf8");
const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>HotelSaver — ${echappe(titreGuide)}</title><style>${css}</style></head><body>${htmlCouverture}${htmlSommaire}${rendu.join("")}${pageFin}</body></html>`;

const SORTIE = join(RACINE, "sortie");
mkdirSync(SORTIE, { recursive: true });
const base = roleUnique ? `Guide-HotelSaver-${roleUnique.id}` : "Guide-HotelSaver-complet";
const fichierHtml = join(SORTIE, `${base}.html`);
writeFileSync(fichierHtml, imagesOriginales ? html : await alleger(html));

const requireApi = createRequire(join(RACINE, "../../apps/api/package.json"));

/**
 * PDF léger (lu sur téléphone, en données mobiles) : chaque image est remplacée par une copie allégée, faite une fois et gardée dans
 * sortie/images/ — le logo du pied de page (affiché à 14-40 px) réduit à 96 px, les captures en JPEG de bonne qualité à la même
 * définition, la photo de couverture réduite. Les fichiers d'origine ne sont pas touchés ; `--images-originales` les garde.
 */
async function alleger(html) {
  const sharp = createRequire(join(RACINE, "../../apps/api/package.json"))("sharp"); // fonction appelée avant la déclaration de requireApi
  const dossier = join(RACINE, "sortie", "images");
  mkdirSync(dossier, { recursive: true });
  const copies = new Map();
  for (const [, adresse] of html.matchAll(/src="(file:\/\/[^"]+)"/g)) {
    if (copies.has(adresse)) continue;
    const source = fileURLToPath(adresse);
    const nom = source.split(/[\\/]/).pop().replace(/\.(png|jpe?g)$/i, "");
    const estLogo = /logo-hotelsaver/.test(nom);
    const cible = join(dossier, `${nom}${estLogo ? ".png" : ".jpg"}`);
    if (!existsSync(cible) || statSync(cible).mtimeMs < statSync(source).mtimeMs) {
      const image = sharp(source);
      if (estLogo) await image.resize(96).png({ compressionLevel: 9 }).toFile(cible);
      else if (/hotel-chambre/.test(nom)) await image.resize({ width: 1000, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(cible);
      else await image.flatten({ background: "#ffffff" }).resize({ width: 600, withoutEnlargement: true }).jpeg({ quality: 75, mozjpeg: true, chromaSubsampling: "4:2:0" }).toFile(cible);
    }
    copies.set(adresse, pathToFileURL(cible).href);
  }
  return html.replace(/src="(file:\/\/[^"]+)"/g, (_, adresse) => `src="${copies.get(adresse)}"`);
}
const { chromium } = requireApi("playwright-core");
const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--allow-file-access-from-files"] });
const page = await navigateur.newPage();
await page.goto(pathToFileURL(fichierHtml).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
// Une page trop pleine passerait sous le pied (texte coupé, mention de droits recouverte) : son contenu est réduit juste assez pour tenir.
const ajustees = await page.evaluate(() => {
  const liste = [];
  document.querySelectorAll(".page").forEach((pg, i) => {
    const corps = pg.querySelector(".corps");
    const pied = pg.querySelector(".pied");
    if (!corps || !pied) return;
    const limite = pied.getBoundingClientRect().top - 8;
    const haut = corps.getBoundingClientRect().top;
    let bas = 0;
    corps.querySelectorAll("*").forEach((e) => {
      const b = e.getBoundingClientRect();
      if (!b.height || getComputedStyle(e).visibility === "hidden") return;
      let visible = b.bottom;
      for (let a = e.parentElement; a && a !== pg; a = a.parentElement) if (getComputedStyle(a).overflow !== "visible") visible = Math.min(visible, a.getBoundingClientRect().bottom);
      bas = Math.max(bas, visible);
    });
    if (bas <= limite) return;
    const r = (limite - haut) / (bas - haut);
    corps.style.transformOrigin = "top center";
    corps.style.transform = `scale(${r.toFixed(3)})`;
    liste.push(`p${i + 1}×${r.toFixed(2)}`);
  });
  return liste;
});
if (ajustees.length) console.log(`pages réduites pour tenir au-dessus du pied : ${ajustees.join(" ")}`);
await page.pdf({ path: join(SORTIE, `${base}.pdf`), preferCSSPageSize: true, printBackground: true });
if (apercu) {
  const dossier = join(SORTIE, `apercu-${base}`);
  rmSync(dossier, { recursive: true, force: true });
  mkdirSync(dossier, { recursive: true });
  await page.setViewportSize({ width: 900, height: 1200 });
  const cibles = await page.locator(".page").all();
  for (let i = 0; i < cibles.length; i += 1) await cibles[i].screenshot({ path: join(dossier, `p${String(i + 1).padStart(2, "0")}.png`) });
}
await navigateur.close();
console.log(`${base}.pdf : ${1 + nbPagesSommaire + pages.length + 1} pages`);
void total;
void readdirSync;
