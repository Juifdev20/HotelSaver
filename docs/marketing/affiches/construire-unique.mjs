/**
 * Affiches « Coming soon » de ScanLinkPay et de HotelSaver, composition propre à nos marques (1254 × 1254, WhatsApp et réseaux).
 * Fond de marque en dégradé avec ondes concentriques, téléphone qui monte du bas, pastilles de fonctions en verre dépoli,
 * texte à gauche, jauge circulaire d'avancement.
 *
 *   node docs/marketing/affiches/construire-unique.mjs   → sortie/<marque>-coming-soon-unique.png
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const asset = (nom) => pathToFileURL(join(ICI, "assets", nom)).href;

const ICONES = {
  recharger: '<path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14"/>',
  payer: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8"/>',
  retirer: '<path d="M12 21V9m0 0l-4 4m4-4l4 4M5 5h14"/>',
  lit: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01"/>',
  caisse: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h2m3 0h3M8 15h2m3 0h3"/>',
  cafe: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M8 3v3m4-3v3"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/>',
  boite: '<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
  graphe: '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
  hors: '<path d="M3 3l18 18M8.5 8.8A7 7 0 0 0 5 11m4.7.3A4 4 0 0 1 12 10.7m6.2.3a10 10 0 0 0-5.4-2.9M12 18.2h.01"/>',
};

const MARQUES = {
  scanlinkpay: {
    nom: ["ScanLink", "Pay"],
    logo: asset("scanlinkpay-logo.png"),
    capture: asset("scanlinkpay-tableau-de-bord.png"),
    fondEcran: "#F5F7FE",
    barre: 58,
    titre: ["Payez, recevez,", "simplement."],
    phrase: "Une nouvelle expérience de paiement se prépare pour vous.",
    avancement: 85,
    c: { a: "#060B3D", b: "#0A1472", c: "#1130F7", clair: "#4CA6F7", accent: "#4CA6F7", texteAccent: "#06124F" },
    carte: asset("carte-scanlinkpay.png"),
    pastilles: [
      { icone: "recharger", titre: "Recharger", texte: "Mobile Money et carte", x: 585, y: 676 },
      { icone: "retirer", titre: "Retirer", texte: "Mobile Money ou banque", x: 905, y: 318 },
    ],
  },
  hotelsaver: {
    nom: ["Hotel", "Saver"],
    logo: asset("hotelsaver-logo.png"),
    capture: asset("hotelsaver-tableau-de-bord.png"),
    fondEcran: "#FFFFFF",
    barre: 34,
    titre: ["Votre hôtel,", "sous contrôle."],
    phrase: "Une nouvelle expérience hôtelière se prépare pour vous.",
    avancement: 90,
    c: { a: "#061224", b: "#053483", c: "#1769E0", clair: "#F5B400", accent: "#F5B400", texteAccent: "#2A1D00" },
    pastilles: [],
  },
};

const icone = (nom, couleur) =>
  `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="${couleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES[nom]}</svg>`;

function barreEtat(couleur) {
  return `<div class="etat"><span>9:41</span><svg width="86" height="26" viewBox="0 0 86 26" fill="${couleur}"><rect x="0" y="14" width="5" height="9" rx="1.5"/><rect x="8" y="10" width="5" height="13" rx="1.5"/><rect x="16" y="6" width="5" height="17" rx="1.5"/><rect x="24" y="2" width="5" height="21" rx="1.5"/><path d="M42 7a14 14 0 0 1 20 0l-2.4 2.6a10.4 10.4 0 0 0-15.2 0z"/><path d="M46 12a8.6 8.6 0 0 1 12 0l-2.4 2.6a5.2 5.2 0 0 0-7.2 0z"/><circle cx="52" cy="19" r="2.8"/><rect x="66" y="5" width="20" height="14" rx="4" fill="none" stroke="${couleur}" stroke-width="2"/><rect x="68.5" y="7.5" width="12" height="9" rx="2"/></svg></div>`;
}

function page(m) {
  const c = m.c;
  const r = 70;
  const perimetre = 2 * Math.PI * r;
  const pastilles = m.pastilles
    .map(
      (p) => `<div class="pastille" style="left:${p.x}px;top:${p.y}px"><span class="pico">${icone(p.icone, c.texteAccent)}</span><div><b>${p.titre}</b><small>${p.texte}</small></div></div>`,
    )
    .join("");
  const liste = [{ capture: m.capture, left: 720, top: 260, rot: 5, scale: 1.1, z: 3 }];
  const telephones = liste
    .map(
      (t) => `<div class="tel" style="left:${t.left}px;top:${t.top}px;transform:rotate(${t.rot}deg) scale(${t.scale});z-index:${t.z}"><div class="ecran"><img class="cap" src="${t.capture}" alt="">${barreEtat("#111")}<div class="ilot"></div><div class="reflet"></div></div></div>`,
    )
    .join("");
  const epaisseur = Array.from({ length: 9 }, (_, i) => `<i style="transform:translateZ(${-(i + 1) * 1.6}px);background:${i % 2 ? "#0A17A8" : "#0F26D8"}"></i>`).join("");
  const carte = m.carte
    ? `<div class="scene"><div class="ombre-carte"></div><div class="carte3d">${epaisseur}<img src="${m.carte}" alt=""><span class="gloss"></span></div></div>`
    : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  .scene{position:absolute;left:365px;top:790px;width:560px;height:360px;perspective:1500px;z-index:7;pointer-events:none}
  .carte3d{position:absolute;left:30px;top:20px;width:500px;height:315px;transform-style:preserve-3d;transform:rotateX(18deg) rotateY(-24deg) rotateZ(-9deg);border-radius:18px}
  .carte3d img{position:absolute;inset:0;width:100%;height:100%;display:block;border-radius:18px;box-shadow:0 0 0 1px rgba(255,255,255,.35)}
  .carte3d i{position:absolute;inset:0;border-radius:18px}
  .carte3d .gloss{position:absolute;inset:0;border-radius:18px;background:linear-gradient(118deg,rgba(255,255,255,.42) 0%,rgba(255,255,255,.08) 28%,rgba(255,255,255,0) 42%,rgba(255,255,255,0) 70%,rgba(255,255,255,.16) 100%)}
  .ombre-carte{position:absolute;left:60px;top:250px;width:470px;height:90px;border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,30,.6),transparent 68%);transform:rotate(-8deg);filter:blur(6px)}
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:1254px;height:1254px;overflow:hidden;font-family:"Inter","Inter Display",sans-serif;position:relative;color:#fff;
    background:radial-gradient(ellipse 60% 55% at 74% 52%,${c.c} 0%,${c.b} 55%,${c.a} 100%)}
  svg.ondes{position:absolute;left:0;top:0}
  .grain{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.16) 1.4px,transparent 1.6px);background-size:34px 34px;opacity:.5;-webkit-mask-image:linear-gradient(100deg,#000 0,transparent 55%);mask-image:linear-gradient(100deg,#000 0,transparent 55%)}
  .marque{position:absolute;left:84px;top:78px;display:flex;align-items:center;gap:18px}
  .marque img{width:76px;height:76px;border-radius:20px;box-shadow:0 12px 28px rgba(0,0,0,.35)}
  .marque b{font-size:44px;font-weight:800;letter-spacing:-.035em}
  .marque b em{font-style:normal;color:${c.accent}}
  .tag{position:absolute;left:84px;top:300px;display:inline-flex;align-items:center;gap:14px;height:54px;padding:0 26px 0 20px;border-radius:27px;background:${c.accent};color:${c.texteAccent};font-weight:800;font-size:23px;letter-spacing:.22em}
  .tag i{width:14px;height:14px;border-radius:50%;background:${c.texteAccent};box-shadow:0 0 0 6px rgba(255,255,255,.4)}
  h1{position:absolute;left:84px;top:384px;font-size:76px;line-height:1.06;font-weight:800;letter-spacing:-.035em;width:640px}
  h1 span{color:${c.accent}}
  .phrase{position:absolute;left:84px;top:604px;width:470px;font-size:27px;line-height:1.5;font-weight:500;color:rgba(255,255,255,.82)}
  .jauge{position:absolute;left:84px;top:858px;width:150px;height:150px}
  .jauge b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:800;letter-spacing:-.02em}
  .jauge-texte{position:absolute;left:84px;top:1024px;width:420px;font-size:22px;font-weight:600;letter-spacing:.06em;color:rgba(255,255,255,.78);line-height:1.4}
  .jauge-texte strong{color:#fff;font-weight:800}
  .tel{position:absolute;width:400px;height:838px;border-radius:68px;padding:14px;transform-origin:50% 0;
    background:linear-gradient(150deg,#4A566C,#0B1220 45%,#2B3548);box-shadow:0 60px 90px rgba(0,0,0,.5),0 0 0 2px rgba(255,255,255,.16),0 0 120px ${c.c}}
  .ecran{position:relative;width:100%;height:100%;border-radius:54px;overflow:hidden;background:${m.fondEcran}}
  .ecran img.cap{position:absolute;left:0;top:0;width:100%;height:auto;display:block}
  .etat{position:absolute;left:0;right:0;top:0;height:${m.barre}px;background:${m.fondEcran};display:flex;align-items:center;justify-content:space-between;padding:${m.barre > 40 ? 6 : 0}px 38px 0 44px;font-weight:700;font-size:${m.barre > 40 ? 22 : 19}px;color:#111}
  .ilot{position:absolute;left:50%;top:${m.barre > 40 ? 12 : 7}px;width:112px;height:${m.barre > 40 ? 32 : 26}px;margin-left:-56px;border-radius:20px;background:#05080F;z-index:3}
  .reflet{position:absolute;inset:0;border-radius:54px;background:linear-gradient(115deg,rgba(255,255,255,.3),rgba(255,255,255,0) 32%,rgba(255,255,255,0) 70%,rgba(255,255,255,.08));z-index:4}
  .pastille{position:absolute;z-index:5;display:flex;align-items:center;gap:16px;padding:16px 26px 16px 16px;border-radius:26px;background:${c.a}EB;border:1.5px solid rgba(255,255,255,.28);box-shadow:0 22px 40px rgba(0,0,0,.35);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
  .pico{width:56px;height:56px;border-radius:18px;background:${c.accent};display:flex;align-items:center;justify-content:center;flex:none}
  .pastille b{display:block;font-size:24px;font-weight:800;letter-spacing:-.01em;white-space:nowrap}
  .pastille small{display:block;margin-top:3px;font-size:16.5px;font-weight:500;color:rgba(255,255,255,.82);white-space:nowrap}
  </style></head><body>
  <svg class="ondes" width="1254" height="1254" viewBox="0 0 1254 1254" fill="none">
    <g stroke="#fff" stroke-width="2"><circle cx="925" cy="690" r="290" opacity=".2"/><circle cx="925" cy="690" r="430" opacity=".14"/><circle cx="925" cy="690" r="580" opacity=".09"/><circle cx="925" cy="690" r="740" opacity=".06"/></g>
    <circle cx="925" cy="690" r="290" stroke="${c.accent}" stroke-width="4" stroke-dasharray="3 22" stroke-linecap="round" opacity=".7"/>
  </svg>
  <div class="grain"></div>
  <div class="marque"><img src="${m.logo}" alt=""><b>${m.nom[0]}<em>${m.nom[1]}</em></b></div>
  <div class="tag"><i></i>COMING SOON</div>
  <h1>${m.titre[0]}<br><span>${m.titre[1]}</span></h1>
  <p class="phrase">${m.phrase}</p>
  <div class="jauge"><svg width="150" height="150" viewBox="0 0 150 150"><circle cx="75" cy="75" r="${r}" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="14"/><circle cx="75" cy="75" r="${r}" fill="none" stroke="${c.accent}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(perimetre * m.avancement) / 100} ${perimetre}" transform="rotate(-90 75 75)"/></svg><b>${m.avancement}%</b></div>
  <div class="jauge-texte"><strong>Le lancement approche.</strong><br>Restez connectés.</div>
  ${telephones}
  ${pastilles}
  ${carte}
  </body></html>`;
}

const SORTIE = join(ICI, "sortie");
mkdirSync(SORTIE, { recursive: true });
const requireApi = createRequire(join(ICI, "../../../apps/api/package.json"));
const { chromium } = requireApi("playwright-core");
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--allow-file-access-from-files"] });
/** Une affiche par interface : on ne mélange jamais deux interfaces sur la même image. */
const sansInternet = { icone: "hors", titre: "Sans internet", texte: "Tout continue de marcher" };
const VARIANTES = [
  { fichier: "scanlinkpay-coming-soon-unique", marque: MARQUES.scanlinkpay },
  {
    fichier: "hotelsaver-coming-soon-unique-patron",
    marque: { ...MARQUES.hotelsaver, pastilles: [
      { icone: "graphe", titre: "Rapports", texte: "Recettes mois par mois", x: 585, y: 676 },
      { ...sansInternet, x: 905, y: 318 },
    ] },
  },
  {
    fichier: "hotelsaver-coming-soon-unique-reception",
    marque: { ...MARQUES.hotelsaver, capture: asset("hotelsaver-reception-accueil.png"), pastilles: [
      { icone: "lit", titre: "Chambres", texte: "Libres, occupées, réservées", x: 585, y: 676 },
      { icone: "agenda", titre: "Réservations", texte: "Arrivées et départs", x: 905, y: 318 },
    ] },
  },
  {
    fichier: "hotelsaver-coming-soon-unique-cafeteria",
    marque: { ...MARQUES.hotelsaver, capture: asset("hotelsaver-cafeteria-accueil.png"), pastilles: [
      { icone: "scan", titre: "Vente rapide", texte: "Scannez les articles", x: 585, y: 676 },
      { icone: "boite", titre: "Stock", texte: "Alertes de stock bas", x: 905, y: 318 },
    ] },
  },
];
for (const v of VARIANTES) {
  const html = join(SORTIE, `${v.fichier}.html`);
  writeFileSync(html, page(v.marque));
  const p = await nav.newPage({ viewport: { width: 1254, height: 1254 }, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(html).href, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(SORTIE, `${v.fichier}.png`) });
  await p.close();
}
await nav.close();
console.log("affiches faites");
