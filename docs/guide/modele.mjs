/**
 * Modèle du guide : fonctions qui fabriquent les pages (couverture, étapes avec téléphone, écran annoté, texte…).
 * Le contenu des chapitres (contenu/*.mjs) n'appelle que ces fonctions : changer la mise en page = changer ce fichier et guide.css.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { icone } from "./icones.mjs";

export const RACINE = dirname(fileURLToPath(import.meta.url));
export const LOGO = pathToFileURL(join(RACINE, "../../apps/web/public/logo-hotelsaver.png")).href;
const PHOTO_COUVERTURE = pathToFileURL(join(RACINE, "../../apps/web/public/hotel-chambre-bleue.jpg")).href;

/** Échappe le HTML ; `**gras**` devient du gras. */
export function t(texte) {
  return String(texte ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/** Taille d'une image PNG (lue dans l'en-tête du fichier). */
const dimensionsCache = new Map();
export function dimensions(chemin) {
  const abs = resolve(RACINE, chemin);
  if (!dimensionsCache.has(abs)) {
    const o = readFileSync(abs);
    if (o.readUInt32BE(0) !== 0x89504e47) throw new Error(`Pas un PNG : ${chemin}`);
    dimensionsCache.set(abs, { l: o.readUInt32BE(16), h: o.readUInt32BE(20) });
  }
  return dimensionsCache.get(abs);
}
const url = (chemin) => pathToFileURL(resolve(RACINE, chemin)).href;

/* ------------------------------------------------------------------ téléphone / vue */

function reperesHtml(reperes = [], largeur, hauteur) {
  return reperes
    .map((r) =>
      r.point
        ? `<div class="repere repere--point" style="left:${(r.x * largeur).toFixed(1)}px;top:${(r.y * hauteur).toFixed(1)}px"><b>${t(r.n)}</b></div>`
        : (
        `<div class="repere" style="left:${(r.x * largeur).toFixed(1)}px;top:${(r.y * hauteur).toFixed(1)}px;width:${(r.l * largeur).toFixed(1)}px;height:${(r.h * hauteur).toFixed(1)}px">${r.n != null ? `<b>${t(r.n)}</b>` : ""}</div>`
      )
    )
    .join("");
}

/** Téléphone complet autour d'une capture ; `largeurEcran` en px. */
export function telephone(image, largeurEcran, { reperes = [] } = {}) {
  const d = dimensions(image);
  const hauteur = (largeurEcran * d.h) / d.l;
  return `<div class="tel" style="width:${largeurEcran + 18}px"><div class="tel__ilot"></div><div class="tel__ecran" style="width:${largeurEcran}px;height:${hauteur.toFixed(1)}px"><img src="${url(image)}" style="top:0" alt="">${reperesHtml(reperes, largeurEcran, hauteur)}</div></div>`;
}

/**
 * Extrait d'écran dans une carte flottante : la tranche de la capture de y0 à y1 (fractions de la hauteur) et, si besoin,
 * de x0 à x1 (fractions de la largeur) ; `largeur` = largeur visible de la carte en px.
 */
export function extrait(image, largeur, y0, y1, { reperes = [], x0 = 0, x1 = 1 } = {}) {
  const d = dimensions(image);
  const complete = largeur / (x1 - x0);
  const hTotale = (complete * d.h) / d.l;
  const hVue = (y1 - y0) * hTotale;
  const reperesRel = reperes.map((r) => ({ ...r, x: (r.x - x0) / (x1 - x0), l: (r.l ?? 0) / (x1 - x0), y: (r.y - y0) / (y1 - y0), h: (r.h ?? 0) / (y1 - y0) }));
  return `<div class="vue" style="width:${largeur}px;height:${hVue.toFixed(1)}px"><img src="${url(image)}" style="top:${(-y0 * hTotale).toFixed(1)}px;left:${(-x0 * complete).toFixed(1)}px;width:${complete.toFixed(1)}px" alt="">${reperesHtml(reperesRel, largeur, hVue)}</div>`;
}

/* ------------------------------------------------------------------ pages de contenu */

const contenu = (corps, variante = "clair") => ({ kind: "contenu", variante, corps });
const plein = (html) => ({ kind: "plein", html });

function enteteTitre({ surtitre, titre, chapo }) {
  return `${surtitre ? `<div class="surtitre">${t(surtitre)}</div>` : ""}${titre ? `<h2 class="titre-page">${t(titre)}</h2>` : ""}${chapo ? `<p class="chapo">${t(chapo)}</p>` : ""}`;
}

/**
 * Étapes numérotées, chacune avec son visuel. Chaque étape :
 * { titre, texte, action?, image, vue?: [y0, y1], zone?: [x0, y0, x1, y1], reperes?: [{x, y, l, h, n}] } (coordonnées en fractions de la capture).
 * ni `vue` ni `zone` = le haut de l'écran dans un téléphone ; `vue` (tranche en hauteur) ou `zone` (rectangle) = extrait de l'écran dans une carte.
 */
export function etapes({ surtitre, titre, chapo, etapes: liste, depart = 1, apres = [] }) {
  const n = liste.length;
  const hauteurEtape = titre ? (n >= 3 ? 246 : 300) : n >= 3 ? 280 : 330;
  const lignes = liste
    .map((e, i) => {
      const inverse = i % 2 === 1;
      const H = hauteurEtape;
      let visuel;
      if (e.vue || e.zone) {
        const d = dimensions(e.image);
        const ratio = d.h / d.l;
        const largeurMax = 258;
        const [x0, y0, x1, y1] = e.zone ?? [0, e.vue[0], 1, e.vue[1]];
        const largeur = Math.min(largeurMax, ((H - 44) * (x1 - x0)) / ((y1 - y0) * ratio));
        visuel = `<div class="etape__visuel etape__visuel--detail" style="height:${H}px">${extrait(e.image, Math.round(largeur), y0, y1, { reperes: e.reperes, x0, x1 })}</div>`;
      } else {
        visuel = `<div class="etape__visuel" style="height:${H}px"><div style="margin-top:24px">${telephone(e.image, 186, { reperes: e.reperes })}</div></div>`;
      }
      return `<div class="etape${inverse ? " etape--inverse" : ""}" style="height:${H}px"><div class="etape__texte"><div class="etape__num">${depart + i}</div><h3>${t(e.titre)}</h3><p>${t(e.texte)}</p>${
        e.action ? `<div class="etape__action">${icone("fleche", 16, 2.2)}<span>${t(e.action)}</span></div>` : ""
      }</div>${visuel}</div>`;
    })
    .join("");
  return contenu(`${titre || surtitre ? `<div style="margin-bottom:22px">${enteteTitre({ surtitre, titre, chapo })}</div>` : ""}${lignes}${apres.map(bloc).join("")}`);
}

/**
 * Écran entier annoté : un grand téléphone au centre, des repères numérotés sur l'écran et, de chaque côté, les légendes reliées par un trait.
 * marques : [{ n, titre, texte, x, y, cote: "g" | "d" }] — x, y = point visé, en fraction de la capture.
 */
export function annote({ surtitre, titre, chapo, image, marques, largeurEcran = 292, bas }) {
  const d = dimensions(image);
  const hEcran = (largeurEcran * d.h) / d.l;
  const largeurCorps = 682;
  const haut = 124;
  const telX = (largeurCorps - (largeurEcran + 18)) / 2;
  const reperes = marques.map((m) => ({ x: m.x, y: m.y, point: true, n: m.n }));
  const legL = 205;
  const hLeg = 96;
  let svg = "";
  let legendes = "";
  for (const cote of ["g", "d"]) {
    const liste = marques.filter((m) => (cote === "g" ? m.cote !== "d" : m.cote === "d")).sort((a, b) => a.y - b.y);
    let plancher = haut;
    for (const m of liste) {
      const py = haut + 9 + m.y * hEcran;
      const top = Math.max(plancher, py - 34);
      plancher = top + hLeg + 14;
      const x0 = cote === "g" ? 0 : largeurCorps - legL;
      legendes += `<div class="legende" style="left:${x0}px;top:${top}px;width:${legL}px"><div class="legende__tete"><i>${t(m.n)}</i><h4>${t(m.titre)}</h4></div><p>${t(m.texte)}</p></div>`;
      const px = telX + 9 + m.x * largeurEcran;
      const ax = cote === "g" ? x0 + legL : x0;
      const ay = top + 25;
      svg += `<path d="M${ax},${ay} L${cote === "g" ? ax + 24 : ax - 24},${ay} L${px},${py}" fill="none" stroke="#1769E0" stroke-width="1.5" stroke-dasharray="4 3"/><circle cx="${ax}" cy="${ay}" r="3.4" fill="#1769E0"/>`;
    }
  }
  const tel = `<div class="annote__tel" style="top:${haut}px;left:${telX}px;transform:none">${telephone(image, largeurEcran, { reperes })}</div>`;
  const decor = `<div style="position:absolute;left:${telX - 56}px;top:${haut - 30}px;width:${largeurEcran + 130}px;height:${hEcran + 78}px;border-radius:46px;background:linear-gradient(170deg,#EAF3FF,#D6E6FD);"></div>`;
  return contenu(
    `<div style="height:${haut - 18}px">${enteteTitre({ surtitre, titre, chapo })}</div><div class="annote" style="top:0">${decor}<svg class="annote__svg" width="${largeurCorps}" height="900">${svg}</svg>${tel}${legendes}</div>${
      bas ? `<div style="position:absolute;left:0;right:0;bottom:0">${bas}</div>` : ""
    }`
  );
}

/** Page de texte : blocs libres (voir `bloc`). */
export function texte({ surtitre, titre, chapo, blocs = [], variante = "clair" }) {
  return contenu(`${enteteTitre({ surtitre, titre, chapo })}${blocs.map(bloc).join("")}`, variante);
}

export function encadre(type, titre, corps) {
  const nom = { info: "info", attention: "attention", conseil: "ok" }[type] ?? "info";
  return `<div class="encadre${type === "attention" ? " encadre--attention" : type === "conseil" ? " encadre--conseil" : ""}">${icone(nom, 22)}<div><b>${t(titre)}</b><span>${t(corps)}</span></div></div>`;
}

/** Un bloc de texte : { h }, { p }, { liste }, { numerotee }, { parcours: [{ titre, texte }] } (étapes reliées par un trait), { encadre }, { tableau }, { cartes }, { ruban }, { html }. */
export function bloc(b) {
  const sortie = [];
  if (b.h) sortie.push(`<h3>${t(b.h)}</h3>`);
  if (b.p) sortie.push(...[].concat(b.p).map((x) => `<p>${t(x)}</p>`));
  if (b.liste) sortie.push(`<ul class="liste">${b.liste.map((x) => `<li>${icone(x.icone ?? "coche", 18, 2.4)}<span>${t(x.texte ?? x)}</span></li>`).join("")}</ul>`);
  if (b.numerotee) sortie.push(`<ol class="liste liste--num">${b.numerotee.map((x) => `<li><span>${t(x)}</span></li>`).join("")}</ol>`);
  if (b.parcours) sortie.push(`<ol class="parcours">${b.parcours.map((x, i) => `<li><i>${i + 1}</i><div><b>${t(x.titre)}</b>${x.texte ? `<span>${t(x.texte)}</span>` : ""}</div></li>`).join("")}</ol>`);
  if (b.encadre) sortie.push(encadre(b.encadre.type ?? "info", b.encadre.titre, b.encadre.texte));
  if (b.tableau) {
    const { entetes, lignes } = b.tableau;
    const cellule = (c) => (c === true ? '<span class="oui">Oui</span>' : c === false ? '<span class="non">Non</span>' : t(c));
    sortie.push(`<table class="tableau"><thead><tr>${entetes.map((e) => `<th>${t(e)}</th>`).join("")}</tr></thead><tbody>${lignes.map((l) => `<tr>${l.map((c) => `<td>${cellule(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
  }
  if (b.cartes) {
    sortie.push(
      `<div class="cartes cartes--${b.colonnes ?? 3}">${b.cartes
        .map((c) => `<div class="carte"><div class="carte__ico">${icone(c.icone, 24)}</div><h4>${t(c.titre)}</h4>${c.texte ? `<p>${t(c.texte)}</p>` : ""}${c.points ? `<ul>${c.points.map((p) => `<li>${t(p)}</li>`).join("")}</ul>` : ""}</div>`)
        .join("")}</div>`
    );
  }
  if (b.ruban) sortie.push(`<div class="ruban">${icone(b.ruban.icone ?? "info", 26)}<div><b>${t(b.ruban.titre)}</b><span>${t(b.ruban.texte)}</span></div></div>`);
  if (b.html) sortie.push(b.html);
  return `<div class="bloc">${sortie.join("")}</div>`;
}

/* ------------------------------------------------------------------ pages pleines */

/** Formes géométriques de fond (cercles, anneaux, diagonales) en SVG, 794 × 1123. */
function formes(variante) {
  if (variante === "couverture") {
    return `<svg class="couverture__formes" viewBox="0 0 794 1123" preserveAspectRatio="none"><g fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1.5"><circle cx="680" cy="150" r="120"/><circle cx="680" cy="150" r="190"/><circle cx="680" cy="150" r="260"/><circle cx="680" cy="150" r="330"/></g><circle cx="680" cy="150" r="82" fill="rgba(255,255,255,.08)"/><circle cx="120" cy="120" r="44" fill="none" stroke="#F5B400" stroke-width="12" opacity=".9"/><circle cx="742" cy="640" r="10" fill="#F5B400"/></svg>`;
  }
  return `<svg class="chapitre__formes" viewBox="0 0 794 1123" preserveAspectRatio="none"><g fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1.5"><circle cx="760" cy="260" r="110"/><circle cx="760" cy="260" r="190"/><circle cx="760" cy="260" r="270"/><circle cx="760" cy="260" r="350"/></g><circle cx="760" cy="260" r="64" fill="rgba(255,255,255,.1)"/><circle cx="716" cy="640" r="54" fill="none" stroke="#F5B400" stroke-width="12" opacity=".9"/><circle cx="120" cy="1040" r="14" fill="#F5B400"/></svg>`;
}

const ETOILES = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>';

export function couverture({ titre, motEnBleu, sous, roles = [], version, date }) {
  const pastilles = roles.map((r) => `<span>${icone(r.icone, 16, 2)}${t(r.libelle)}</span>`).join("");
  return plein(
    `<div class="page couverture"><div class="couverture__photo"><img src="${PHOTO_COUVERTURE}" alt=""></div>${formes("couverture")}<div class="couverture__carte"><div class="couverture__logo"><img src="${LOGO}" alt=""><b>Hotel<em>Saver</em></b></div><div class="couverture__titre">${t(titre)}<br><span>${t(motEnBleu)}</span></div><p class="couverture__sous">${t(sous)}</p><div class="couverture__roles">${pastilles}</div></div><div class="couverture__bas"><div><b>${t(version)}</b>${t(date)}</div><div class="couverture__etoiles">${ETOILES}${ETOILES}${ETOILES}</div></div></div>`
  );
}

export function chapitre({ numero, titre, role, icone: nomIcone, points = [] }) {
  return plein(
    `<div class="page chapitre">${formes("chapitre")}<div class="chapitre__geant">${String(numero).padStart(2, "0")}</div><div class="chapitre__role">${icone(nomIcone ?? "utilisateur", 16, 2)}${t(role)}</div><div class="chapitre__pastille"><i>${numero}</i><h2>${t(titre)}</h2></div>${
      points.length ? `<div class="chapitre__liste"><p>Dans ce chapitre</p><ul>${points.map((x) => `<li>${icone("coche", 18, 2.6)}<span>${t(x)}</span></li>`).join("")}</ul></div>` : ""
    }</div>`
  );
}

export function sommaire(entrees) {
  // entrees : [{ partie?: "Titre", numero, titre, page }]
  const lignes = entrees
    .map((e) =>
      e.partie
        ? `<div class="sommaire__partie">${t(e.partie)}</div>`
        : `<div class="sommaire__ligne"><span class="sommaire__num">${e.numero}</span><b>${t(e.titre)}</b><small>page ${e.page}</small></div>`
    )
    .join("");
  return plein(`<div class="page page--pale sommaire"><div class="sommaire__cercle"></div><div class="sommaire__cercle2"></div><div class="sommaire__titre">Sommaire</div><div class="sommaire__liste">${lignes}</div>{{PIED}}</div>`);
}

export function pageFinale({ titre, texte: corps, contacts }) {
  const cartes = contacts.map((c) => `<div class="fin__contact">${icone(c.icone, 24)}<b>${t(c.titre)}</b><span>${t(c.texte)}</span></div>`).join("");
  return plein(
    `<div class="page fin">${formes("chapitre")}<div class="fin__centre"><img src="${LOGO}" alt=""><h2>${t(titre)}</h2><p>${t(corps)}</p><div class="fin__contacts">${cartes}</div></div></div>`
  );
}
