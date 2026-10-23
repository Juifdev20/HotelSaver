/**
 * Dessine la face avant de la carte ScanLinkPay (mêmes feuilles de style et mêmes éléments que linkpay-web/src/components/card)
 * sur fond transparent, à plat : l'affiche l'incline ensuite en 3D.   node docs/marketing/affiches/carte-scanlinkpay.mjs
 * Numéro, nom et QR sont des exemples : aucune vraie carte n'est montrée.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const A = join(ICI, "assets");
const drc = readFileSync(join(A, "carte/drc-path.txt"), "utf8").trim();
const css = readFileSync(join(A, "carte/card.css"), "utf8");
const qrSource = readFileSync(join(A, "qr.svg"), "utf8").replace(/stroke="#000000"/, 'stroke="#0B1033"').replace(/<path fill="#ffffff"[^>]*\/>/, "").replace("<svg ", '<svg shape-rendering="crispEdges" ');
const logo = pathToFileURL(join(A, "carte/logo.png")).href;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
html,body{margin:0;background:transparent}
body{width:1027px;height:648px}
.cadre{--u:12px}</style></head><body><div class="cadre">
<div class="slp-card front"><div class="slp-inner">
<svg class="grat" viewBox="0 0 856 540" preserveAspectRatio="none"><g fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="1.2"><path d="M0 120 Q428 40 856 120"/><path d="M0 230 Q428 150 856 230"/><path d="M0 340 Q428 260 856 340"/><path d="M200 0 Q170 270 200 540"/><path d="M400 0 Q370 270 400 540"/><path d="M600 0 Q570 270 600 540"/><path d="M800 0 Q770 270 800 540"/></g></svg>
<svg class="wave" viewBox="0 0 856 200" preserveAspectRatio="none"><path d="M0 120 C 150 60 300 30 470 80 S 760 140 856 70 V200 H0Z" fill="rgba(120,170,255,.16)"/><path d="M0 150 C 180 100 330 90 500 130 S 770 170 856 120 V200 H0Z" fill="rgba(10,20,140,.35)"/></svg>
<svg class="map" viewBox="0 0 1000 1000"><defs><clipPath id="c"><path d="${drc}"/></clipPath><pattern id="d" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="2.2" fill="#fff" fill-opacity=".2"/></pattern><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fc2ff" stop-opacity=".26"/><stop offset="1" stop-color="#3f7dff" stop-opacity=".12"/></linearGradient></defs>
<path d="${drc}" fill="url(#g)"/><g clip-path="url(#c)"><g transform="rotate(-38 500 500)"><rect x="-300" y="415" width="1600" height="170" fill="#ffd23a" fill-opacity=".16"/><rect x="-300" y="445" width="1600" height="110" fill="#ff5a5a" fill-opacity=".2"/></g><rect width="1000" height="1000" fill="url(#d)"/></g><path d="${drc}" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="3"/></svg>
<div class="abs brand"><div class="word">ScanLink<b>Pay</b></div><div class="slogan">PAYEZ. RECEVEZ. SIMPLEMENT.</div></div>
<div class="abs pill">CDF • USD</div>
<div class="abs hint"><div class="t">Scannez pour payer</div><div class="s">Présentez cette carte, scannez le code avec l’appareil photo. Le paiement est confirmé avec votre PIN.</div></div>
<div class="abs qr"><i></i><i></i><i></i><i></i><div class="tile">${qrSource}</div></div>
<div class="abs num">9243 0012 3456 7895</div>
<div class="abs holder"><div class="lbl">Titulaire</div><div class="val">Prénom Nom</div></div>
<div class="abs valid"><div class="lbl">Valide jusqu’au</div><div class="val">12/30</div></div>
<div class="abs logo-br"><img src="${logo}" alt=""></div>
</div></div></div></body></html>`;

const requireApi = createRequire(join(ICI, "../../../apps/api/package.json"));
const { chromium } = requireApi("playwright-core");
writeFileSync(join(A, "carte/carte.html"), html);
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--allow-file-access-from-files"] });
const p = await nav.newPage({ viewport: { width: 1027, height: 648 }, deviceScaleFactor: 2 });
await p.goto(pathToFileURL(join(A, "carte/carte.html")).href, { waitUntil: "load" });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(300);
await p.screenshot({ path: join(A, "carte-scanlinkpay.png"), omitBackground: true });
await nav.close();
console.log("carte faite");
