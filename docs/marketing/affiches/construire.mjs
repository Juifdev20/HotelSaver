/**
 * Affiches « Coming soon » de ScanLinkPay et de HotelSaver (1080 × 1920, format story).
 * Même composition pour les deux : un téléphone qui montre le tableau de bord de l'application, suspendu à un ruban, des objets qui
 * parlent du métier (paiement ou hôtel), « COMING SOON », « STAY TUNED », une phrase et une barre d'avancement.
 *
 *   node docs/marketing/affiches/construire.mjs            → sortie/scanlinkpay-coming-soon.png et sortie/hotelsaver-coming-soon.png
 *
 * Les images du dossier assets/ sont des copies : les logos des applications et une capture de leur tableau de bord.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const asset = (nom) => pathToFileURL(join(ICI, "assets", nom)).href;
const qr = readFileSync(join(ICI, "assets/qr.svg"), "utf8");
const qrTrait = /<path stroke="[^"]*" d="([^"]+)"/.exec(qr)?.[1] ?? "";
const qrTaille = Number(/viewBox="0 0 (\d+)/.exec(qr)?.[1] ?? 29);

const MARQUES = {
  scanlinkpay: {
    nom: { debut: "ScanLink", fin: "Pay" },
    logo: asset("scanlinkpay-logo.png"),
    capture: asset("scanlinkpay-tableau-de-bord.png"),
    fondEcran: "#F5F7FE",
    barre: 58,
    slogan: "Payez. Recevez. Simplement.",
    phrase: ["Une nouvelle expérience de paiement", "se prépare pour vous."],
    avancement: 85,
    c: { fonce: "#0A1472", principal: "#1130F7", clair: "#4CA6F7", bande: "#4CA6F7", texteBande: "#FFFFFF", ruban: "#1130F7", cadre: "#0A1472" },
    objets: "paiement",
  },
  hotelsaver: {
    nom: { debut: "Hotel", fin: "Saver" },
    logo: asset("hotelsaver-logo.png"),
    capture: asset("hotelsaver-tableau-de-bord.png"),
    fondEcran: "#FFFFFF",
    barre: 34,
    slogan: "Gérez votre hôtel, simplement.",
    phrase: ["Une nouvelle expérience hôtelière", "se prépare pour vous."],
    avancement: 90,
    c: { fonce: "#053483", principal: "#1769E0", clair: "#4C8DF0", bande: "#F5B400", texteBande: "#06214F", ruban: "#1769E0", cadre: "#053483" },
    objets: "hotel",
  },
};

/* ------------------------------------------------------------------ objets dessinés en SVG */

const degrades = (id, c) => `
  <linearGradient id="${id}-carte" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.fonce}"/><stop offset=".55" stop-color="${c.principal}"/><stop offset="1" stop-color="${c.clair}"/></linearGradient>
  <linearGradient id="${id}-or" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE08A"/><stop offset=".5" stop-color="#F5B400"/><stop offset="1" stop-color="#B97F00"/></linearGradient>
  <linearGradient id="${id}-orcote" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#A16F00"/><stop offset=".35" stop-color="#E8A800"/><stop offset=".7" stop-color="#C98B00"/><stop offset="1" stop-color="#8F6200"/></linearGradient>
  <linearGradient id="${id}-argent" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#DDE5F2"/><stop offset="1" stop-color="#9FB0C9"/></linearGradient>`;

function cartePaiement(c, logo) {
  return `<svg viewBox="0 0 540 340" width="540" height="340"><defs>${degrades("cp", c)}
    <clipPath id="cp-clip"><rect width="520" height="320" rx="30"/></clipPath></defs>
    <g transform="translate(10 10)"><rect width="520" height="320" rx="30" fill="url(#cp-carte)"/>
    <g clip-path="url(#cp-clip)"><ellipse cx="470" cy="20" rx="260" ry="190" fill="#fff" opacity=".10"/><ellipse cx="60" cy="330" rx="220" ry="120" fill="#fff" opacity=".07"/></g>
    <image href="${logo}" x="36" y="30" width="62" height="62"/>
    <text x="112" y="72" font-family="Inter" font-weight="800" font-size="30" fill="#fff">ScanLinkPay</text>
    <rect x="40" y="130" width="82" height="62" rx="12" fill="url(#cp-or)"/><path d="M40 161h82M81 130v62M40 146h28M95 146h27M40 176h28M95 176h27" stroke="#9A6A00" stroke-width="2" fill="none" opacity=".55"/>
    <g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".95"><path d="M168 146a30 30 0 0 1 0 30"/><path d="M186 132a52 52 0 0 1 0 58"/><path d="M204 118a74 74 0 0 1 0 86"/></g>
    <text x="40" y="262" font-family="Inter" font-weight="600" font-size="30" letter-spacing="5" fill="#fff" opacity=".92">••••  ••••  ••••  2026</text>
    <text x="40" y="296" font-family="Inter" font-weight="600" font-size="15" letter-spacing="4" fill="#fff" opacity=".75">PAYEZ. RECEVEZ. SIMPLEMENT.</text></g></svg>`;
}

function pieces(c) {
  const pile = (n, x, y, r, symbole) => {
    let s = "";
    for (let i = 0; i < n; i += 1) {
      const yy = y - i * 24;
      s += `<ellipse cx="${x}" cy="${yy + 24}" rx="${r}" ry="${r * 0.38}" fill="url(#pc-orcote)"/><rect x="${x - r}" y="${yy}" width="${2 * r}" height="24" fill="url(#pc-orcote)"/>
            <ellipse cx="${x}" cy="${yy + 24}" rx="${r}" ry="${r * 0.38}" fill="url(#pc-orcote)"/>
            <path d="M${x - r} ${yy}v24M${x + r} ${yy}v24" stroke="#7A5300" stroke-width="1.5" opacity=".5"/>`;
    }
    const top = y - (n - 1) * 24;
    s += `<ellipse cx="${x}" cy="${top}" rx="${r}" ry="${r * 0.38}" fill="url(#pc-or)" stroke="#B97F00" stroke-width="2"/>
          <ellipse cx="${x}" cy="${top}" rx="${r * 0.74}" ry="${r * 0.28}" fill="none" stroke="#B97F00" stroke-width="2" opacity=".7"/>
          <text x="${x}" y="${top + r * 0.1}" text-anchor="middle" font-family="Inter" font-weight="900" font-size="${r * 0.55}" fill="#9A6A00" opacity=".85" transform="translate(0 ${top * 0.55}) scale(1 .62) translate(0 ${-top * 0.55})">${symbole}</text>`;
    return s;
  };
  return `<svg viewBox="0 0 420 260" width="420" height="260"><defs>${degrades("pc", c)}</defs>
    <ellipse cx="205" cy="232" rx="190" ry="22" fill="#000" opacity=".16"/>
    ${pile(2, 120, 184, 68, "FC")}${pile(4, 262, 200, 82, "$")}</svg>`;
}

function etiquetteQr(c) {
  return `<svg viewBox="0 0 230 270" width="230" height="270"><defs>${degrades("qr", c)}</defs>
    <rect x="10" y="10" width="210" height="250" rx="34" fill="#fff"/>
    <rect x="10" y="10" width="210" height="250" rx="34" fill="none" stroke="${c.principal}" stroke-width="3" opacity=".25"/>
    <g transform="translate(40 36) scale(${150 / qrTaille})"><path d="${qrTrait}" stroke="${c.fonce}" fill="none" shape-rendering="crispEdges"/></g>
    <rect x="30" y="204" width="170" height="34" rx="17" fill="${c.principal}"/>
    <text x="115" y="228" text-anchor="middle" font-family="Inter" font-weight="800" font-size="19" letter-spacing="4" fill="#fff">SCANNEZ</text></svg>`;
}

function carteChambre(c, logo) {
  return `<svg viewBox="0 0 540 340" width="540" height="340"><defs>${degrades("ck", c)}
    <linearGradient id="ck-blanc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E4EDFC"/></linearGradient>
    <clipPath id="ck-clip"><rect width="520" height="320" rx="30"/></clipPath></defs>
    <g transform="translate(10 10)"><rect width="520" height="320" rx="30" fill="url(#ck-blanc)"/>
    <g clip-path="url(#ck-clip)"><rect width="520" height="96" fill="url(#ck-carte)"/><rect y="238" width="520" height="82" fill="#0B1628"/><ellipse cx="500" cy="-10" rx="200" ry="120" fill="#fff" opacity=".12"/></g>
    <image href="${logo}" x="34" y="14" width="68" height="68"/>
    <text x="118" y="58" font-family="Inter" font-weight="800" font-size="32" fill="#fff">HotelSaver</text>
    <text x="40" y="162" font-family="Inter" font-weight="800" font-size="62" fill="${c.fonce}">101</text>
    <text x="42" y="196" font-family="Inter" font-weight="600" font-size="17" letter-spacing="5" fill="${c.fonce}" opacity=".7">CHAMBRE</text>
    <g fill="none" stroke="${c.principal}" stroke-width="6" stroke-linecap="round"><path d="M400 150a30 30 0 0 1 0 36"/><path d="M420 134a54 54 0 0 1 0 68"/><path d="M440 118a78 78 0 0 1 0 100"/></g>
    <text x="40" y="288" font-family="Inter" font-weight="600" font-size="16" letter-spacing="5" fill="#fff" opacity=".8">BIENVENUE · WELCOME</text></g></svg>`;
}

function cleChambre(c, logo) {
  return `<svg viewBox="0 0 330 520" width="330" height="520"><defs>${degrades("cl", c)}
    <linearGradient id="cl-etiq" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.clair}"/><stop offset=".5" stop-color="${c.principal}"/><stop offset="1" stop-color="${c.fonce}"/></linearGradient></defs>
    <ellipse cx="165" cy="500" rx="120" ry="14" fill="#000" opacity=".14"/>
    <!-- anneau -->
    <circle cx="165" cy="52" r="40" fill="none" stroke="url(#cl-or)" stroke-width="10"/>
    <circle cx="165" cy="52" r="40" fill="none" stroke="#fff" stroke-width="2" opacity=".45" stroke-dasharray="60 200" transform="rotate(-70 165 52)"/>
    <!-- clé -->
    <g transform="translate(165 60)"><path d="M-26 20h52v250a8 8 0 0 1-8 8h-36a8 8 0 0 1-8-8z" fill="none"/></g>
    <g transform="translate(165 106)">
      <circle r="38" fill="url(#cl-or)"/><circle r="18" fill="#fff"/><circle r="18" fill="none" stroke="#B97F00" stroke-width="3"/>
      <rect x="-12" y="30" width="24" height="170" rx="6" fill="url(#cl-orcote)"/>
      <path d="M12 130h30v16H12zM12 164h22v16H12z" fill="url(#cl-orcote)"/>
      <path d="M-6 36v160" stroke="#fff" stroke-width="3" opacity=".35" stroke-linecap="round"/></g>
    <!-- étiquette -->
    <g transform="translate(165 300) rotate(0)"><rect x="-84" y="-14" width="168" height="206" rx="30" fill="url(#cl-etiq)"/>
      <rect x="-84" y="-14" width="168" height="206" rx="30" fill="none" stroke="#fff" stroke-width="3" opacity=".35"/>
      <circle cx="0" cy="12" r="9" fill="#fff" opacity=".9"/>
      <text x="0" y="112" text-anchor="middle" font-family="Inter" font-weight="900" font-size="74" fill="#fff">101</text>
      <image href="${logo}" x="-26" y="124" width="52" height="52"/></g></svg>`;
}

function sonnette(c) {
  return `<svg viewBox="0 0 300 230" width="300" height="230"><defs>${degrades("sn", c)}
    <radialGradient id="sn-dome" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#FFF4C4"/><stop offset=".35" stop-color="#F5B400"/><stop offset="1" stop-color="#8F6200"/></radialGradient></defs>
    <ellipse cx="150" cy="214" rx="132" ry="13" fill="#000" opacity=".16"/>
    <ellipse cx="150" cy="184" rx="130" ry="26" fill="url(#sn-orcote)"/><ellipse cx="150" cy="174" rx="130" ry="26" fill="url(#sn-or)"/>
    <path d="M42 170a108 108 0 0 1 216 0z" fill="url(#sn-dome)"/>
    <path d="M70 160c4-50 36-82 80-84" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".6"/>
    <rect x="136" y="46" width="28" height="14" rx="6" fill="url(#sn-argent)"/><ellipse cx="150" cy="46" rx="22" ry="8" fill="url(#sn-argent)"/>
    <ellipse cx="150" cy="176" rx="64" ry="9" fill="#7A5300" opacity=".25"/></svg>`;
}

/* ------------------------------------------------------------------ l'affiche */

function barreEtat(couleurTexte) {
  return `<div class="etat"><span>9:41</span><svg width="86" height="26" viewBox="0 0 86 26" fill="${couleurTexte}"><rect x="0" y="14" width="5" height="9" rx="1.5"/><rect x="8" y="10" width="5" height="13" rx="1.5"/><rect x="16" y="6" width="5" height="17" rx="1.5"/><rect x="24" y="2" width="5" height="21" rx="1.5"/><path d="M42 7a14 14 0 0 1 20 0l-2.4 2.6a10.4 10.4 0 0 0-15.2 0z"/><path d="M46 12a8.6 8.6 0 0 1 12 0l-2.4 2.6a5.2 5.2 0 0 0-7.2 0z"/><circle cx="52" cy="19" r="2.8"/><rect x="66" y="5" width="20" height="14" rx="4" fill="none" stroke="${couleurTexte}" stroke-width="2"/><rect x="68.5" y="7.5" width="12" height="9" rx="2"/></svg></div>`;
}

function page(cle) {
  const m = MARQUES[cle];
  const c = m.c;
  const segments = 20;
  const pleins = Math.round((m.avancement / 100) * segments);
  const barre = Array.from({ length: segments }, (_, i) => `<i class="${i < pleins ? "on" : ""}"></i>`).join("");
  const objets =
    m.objets === "paiement"
      ? `<div class="obj carte" style="left:610px;top:860px;transform:rotate(24deg)">${cartePaiement(c, m.logo)}</div>
         <div class="obj front" style="left:50px;top:960px;transform:rotate(-4deg)">${pieces(c)}</div>
         <div class="obj front" style="left:772px;top:480px;transform:rotate(11deg)">${etiquetteQr(c)}</div>`
      : `<div class="obj carte" style="left:610px;top:860px;transform:rotate(24deg)">${carteChambre(c, m.logo)}</div>
         <div class="obj front" style="left:92px;top:660px;transform:rotate(14deg)">${cleChambre(c, m.logo)}</div>
         <div class="obj front" style="left:735px;top:935px;transform:rotate(-6deg)">${sonnette(c)}</div>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  :root{--fonce:${c.fonce};--principal:${c.principal};--clair:${c.clair};--bande:${c.bande};}
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:1080px;height:1920px;overflow:hidden;background:#fff;font-family:"Inter","Inter Display",sans-serif;position:relative}
  .fond{position:absolute;inset:0;background:radial-gradient(ellipse 70% 40% at 50% 62%,rgba(17,48,247,.05),transparent 70%),linear-gradient(#fff,#F6F8FD 70%,#EEF2FA)}
  .cadre{position:absolute;inset:30px;border:2px solid var(--fonce);opacity:.9}
  .repere{position:absolute;width:16px;height:16px;background:var(--fonce);top:1812px}
  .repere.g{left:22px}.repere.d{right:22px}
  .marque{position:absolute;left:78px;top:84px;display:flex;align-items:center;gap:20px}
  .marque img{width:84px;height:84px;border-radius:22px;box-shadow:0 14px 30px rgba(6,22,80,.22)}
  .marque b{display:block;font-size:48px;font-weight:800;letter-spacing:-.035em;line-height:1;color:var(--fonce)}
  .marque b em{font-style:normal;color:var(--clair)}
  .marque span{display:block;margin-top:8px;font-size:17px;font-weight:600;letter-spacing:.03em;color:#5A6A86}
  .ruban{position:absolute;left:518px;top:0;width:44px;height:330px;background:linear-gradient(90deg,var(--principal),var(--fonce) 60%,var(--principal));box-shadow:0 10px 24px rgba(6,22,80,.25);clip-path:polygon(0 0,100% 0,100% 100%,0 100%)}
  .ruban::after{content:"";position:absolute;left:0;right:0;top:0;bottom:0;background:repeating-linear-gradient(0deg,transparent 0 14px,rgba(255,255,255,.18) 14px 16px)}
  .scotch{position:absolute;left:470px;top:196px;width:140px;height:62px;transform:rotate(-3deg);background:linear-gradient(180deg,rgba(255,255,255,.88),rgba(235,238,245,.78));box-shadow:0 6px 14px rgba(6,22,80,.18);clip-path:polygon(0 8%,4% 0,8% 10%,12% 0,16% 8%,20% 0,100% 0,100% 100%,20% 100%,16% 92%,12% 100%,8% 90%,4% 100%,0 92%)}
  .anneau{position:absolute;left:500px;top:300px;width:80px;height:80px;border-radius:50%;border:9px solid #F5B400;box-shadow:0 8px 16px rgba(0,0,0,.25),inset 0 2px 3px rgba(255,255,255,.7);background:transparent;z-index:5}
  .ombre{position:absolute;left:250px;top:1160px;width:640px;height:70px;border-radius:50%;background:radial-gradient(ellipse,rgba(6,22,80,.35),transparent 70%)}
  .obj{position:absolute;filter:drop-shadow(0 26px 26px rgba(6,22,80,.28))}
  .obj.front{z-index:6}
  .obj.carte{z-index:2}
  .tel-ancre{position:absolute;left:540px;top:372px;width:0;height:0;z-index:4;transform:rotate(-13deg);transform-origin:0 0}
  .tel{position:absolute;left:-200px;top:0;width:400px;height:838px;border-radius:68px;padding:14px;background:linear-gradient(150deg,#3A4558,#0B1220 45%,#2B3548);box-shadow:0 40px 60px rgba(6,22,80,.35),inset 0 0 0 2px #596378}
  .tel::before{content:"";position:absolute;right:-5px;top:170px;width:6px;height:96px;border-radius:0 4px 4px 0;background:#2B3548}
  .tel::after{content:"";position:absolute;left:-5px;top:140px;width:6px;height:60px;border-radius:4px 0 0 4px;background:#2B3548;box-shadow:0 84px 0 #2B3548}
  .ecran{position:relative;width:100%;height:100%;border-radius:54px;overflow:hidden;background:${m.fondEcran}}
  .ecran img.cap{position:absolute;left:0;top:0;width:100%;height:auto;display:block}
  .etat{position:absolute;left:0;right:0;top:0;height:${m.barre}px;background:${m.fondEcran};display:flex;align-items:center;justify-content:space-between;padding:${m.barre > 40 ? 6 : 0}px 38px 0 44px;font-weight:700;font-size:${m.barre > 40 ? 22 : 19}px;color:#111}
  .ilot{position:absolute;left:50%;top:${m.barre > 40 ? 12 : 7}px;width:112px;height:${m.barre > 40 ? 32 : 26}px;margin-left:-56px;border-radius:20px;background:#05080F;z-index:3}
  .reflet{position:absolute;inset:0;border-radius:54px;background:linear-gradient(115deg,rgba(255,255,255,.34),rgba(255,255,255,0) 32%,rgba(255,255,255,0) 70%,rgba(255,255,255,.10));pointer-events:none;z-index:4}
  .bandeau{position:absolute;left:0;right:0;top:78px;height:50px;background:linear-gradient(90deg,var(--principal),var(--fonce));z-index:5;box-shadow:0 10px 18px rgba(6,22,80,.35)}
  .bandeau::after{content:"";position:absolute;left:0;right:0;top:19px;height:2px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.55) 0 10px,transparent 10px 20px)}
  h1{position:absolute;left:0;right:0;text-align:center;font-weight:900;line-height:.82;letter-spacing:-.04em;color:var(--fonce)}
  h1.a{top:1236px;font-size:212px}h1.b{top:1432px;font-size:262px}
  .stay{position:absolute;left:50%;top:1392px;transform:translateX(-50%) rotate(-1deg);width:640px;height:86px;background:var(--bande);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:50px;letter-spacing:.34em;padding-left:.34em;color:${c.texteBande};z-index:3;box-shadow:0 10px 22px rgba(6,22,80,.2)}
  .phrase{position:absolute;left:0;right:0;top:1688px;text-align:center;font-size:31px;font-weight:500;letter-spacing:.2em;line-height:1.55;color:#2B3A55;padding-left:.2em}
  .avance{position:absolute;left:84px;right:84px;top:1790px;display:flex;align-items:center;gap:26px}
  .avance .seg{flex:1;display:flex;gap:10px}
  .avance i{flex:1;height:26px;border-radius:13px;background:#D5DAE4}
  .avance i.on{background:linear-gradient(180deg,var(--clair),var(--principal) 55%,var(--fonce))}
  .avance b{font-size:42px;font-weight:800;color:var(--fonce);letter-spacing:-.01em;min-width:96px;text-align:right}
  </style></head><body>
  <div class="fond"></div><div class="cadre"></div><i class="repere g"></i><i class="repere d"></i>
  <div class="marque"><img src="${m.logo}" alt=""><div><b>${m.nom.debut}<em>${m.nom.fin}</em></b><span>${m.slogan}</span></div></div>
  <div class="ruban"></div><div class="scotch"></div><div class="anneau"></div>
  <div class="ombre"></div>
  ${objets}
  <div class="tel-ancre"><div class="tel"><div class="ecran"><img class="cap" src="${m.capture}" alt="">${barreEtat("#111")}<div class="ilot"></div><div class="reflet"></div></div><div class="bandeau" style="display:none"></div></div></div>
  <h1 class="a">COMING</h1><div class="stay">STAY TUNED</div><h1 class="b">SOON</h1>
  <p class="phrase">${m.phrase[0]}<br>${m.phrase[1]}</p>
  <div class="avance"><div class="seg">${barre}</div><b>${m.avancement}%</b></div>
  </body></html>`;
}

const SORTIE = join(ICI, "sortie");
mkdirSync(SORTIE, { recursive: true });
const requireApi = createRequire(join(ICI, "../../../apps/api/package.json"));
const { chromium } = requireApi("playwright-core");
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--allow-file-access-from-files"] });
for (const cle of Object.keys(MARQUES)) {
  const html = join(SORTIE, `${cle}-coming-soon.html`);
  writeFileSync(html, page(cle));
  const p = await nav.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 2 });
  await p.goto(pathToFileURL(html).href, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  await p.screenshot({ path: join(SORTIE, `${cle}-coming-soon.png`) });
  await p.close();
}
await nav.close();
console.log("affiches faites");
