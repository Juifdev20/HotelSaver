/**
 * Génère les dérivés de l'identité HotelSaver depuis le logo maître
 * `assets/icons/hotelsaver-icone.png` (1024×1024, badge sur fond transparent,
 * fourni par le patron le 27/09/2026 — voir DECISIONS.md « branding
 * application vs hôtel »).
 *
 * Produit :
 *   - assets/icons/hotelsaver-foreground.png   calque avant plan icône adaptative
 *   - assets/icons/hotelsaver-background.png   calque arrière-plan (dégradé
 *                                              prolongé du badge, sans couture)
 *   - assets/icons/hotelsaver-favicon.png      64×64
 *   - assets/icons/desktop/icon.png            512×512 (BrowserWindow)
 *   - assets/icons/desktop/icon.ico            256×256 encapsulé PNG (Windows)
 *   - apps/mobile/assets/*                     icônes Expo + logo UI
 *   - apps/web/public/*, apps/super-admin/public/*, apps/desktop/resources/*
 *
 * Pas de variante « monochrome » : le badge n'a pas de silhouette utilisable
 * (son alpha = un carré arrondi plein, inutile en icône thémée Android).
 * Ne pas redessiner le logo — demander une version « symbole seul » si besoin.
 *
 * Dépendance : `pngjs`, résolu depuis le store virtuel pnpm (virtualStoreDir,
 * voir pnpm-workspace.yaml) puisqu'il n'est pas une dépendance directe du repo.
 * Usage : node assets/scripts/generer-icones-hotelsaver.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..", "..");
const STORE = "C:/.pnpm-hc";

function chargerPngjs() {
  try {
    return require("pngjs");
  } catch {
    const dossier = fs.readdirSync(STORE).find((d) => d.startsWith("pngjs@"));
    if (!dossier) throw new Error("pngjs introuvable dans " + STORE);
    return require(path.join(STORE, dossier, "node_modules", "pngjs"));
  }
}

const { PNG } = chargerPngjs();

/** Redimensionnement bilinéaire RGBA (src/dst = {width,height,data}). */
function redimensionner(src, largeur, hauteur) {
  const dst = new PNG({ width: largeur, height: hauteur });
  const rx = src.width / largeur;
  const ry = src.height / hauteur;
  for (let y = 0; y < hauteur; y++) {
    const fy = (y + 0.5) * ry - 0.5;
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < largeur; x++) {
      const fx = (x + 0.5) * rx - 0.5;
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const wx = fx - x0;
      const di = (y * largeur + x) * 4;
      for (let c = 0; c < 4; c++) {
        const v =
          src.data[(y0 * src.width + x0) * 4 + c] * (1 - wx) * (1 - wy) +
          src.data[(y0 * src.width + x1) * 4 + c] * wx * (1 - wy) +
          src.data[(y1 * src.width + x0) * 4 + c] * (1 - wx) * wy +
          src.data[(y1 * src.width + x1) * 4 + c] * wx * wy;
        dst.data[di + c] = Math.round(v);
      }
    }
  }
  return dst;
}

/** Copie src dans dst à (dx, dy), en ignorant les pixels hors limites. */
function coller(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const si = (y * src.width + x) * 4;
      const di = (ty * dst.width + tx) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
}

/** Boîte englobante du contenu non transparent (alpha > 10). */
function boiteContenu(png) {
  let minX = png.width, minY = png.height, maxX = 0, maxY = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

function ecrire(png, fichier) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, PNG.sync.write(png));
  console.log("  ✓", path.relative(RACINE, fichier));
}

/** Encapsule un PNG dans un .ico Windows (entrée PNG compressée, Vista+). */
function ecrireIco(png256, fichier) {
  const donneesPng = PNG.sync.write(png256);
  const entete = Buffer.alloc(22);
  entete.writeUInt16LE(0, 0); // réservé
  entete.writeUInt16LE(1, 2); // type icône
  entete.writeUInt16LE(1, 4); // 1 entrée
  entete.writeUInt8(0, 6); // largeur 0 = 256
  entete.writeUInt8(0, 7); // hauteur 0 = 256
  entete.writeUInt8(0, 8); // pas de palette
  entete.writeUInt8(0, 9); // réservé
  entete.writeUInt16LE(1, 10); // plans
  entete.writeUInt16LE(32, 12); // bpp
  entete.writeUInt32LE(donneesPng.length, 14);
  entete.writeUInt32LE(22, 18);
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, Buffer.concat([entete, donneesPng]));
  console.log("  ✓", path.relative(RACINE, fichier));
}

function main() {
  const maitre = PNG.sync.read(fs.readFileSync(path.join(RACINE, "assets/icons/hotelsaver-icone.png")));
  const { minX, minY, maxX, maxY } = boiteContenu(maitre);
  console.log(`Maître ${maitre.width}×${maitre.height}, contenu ${minX},${minY}–${maxX},${maxY}`);

  // --- Calque avant-plan icône adaptative : artwork réduit à ~62 % centré ---
  const echelle = 0.62;
  const tailleArt = Math.round(maitre.width * echelle);
  const art = redimensionner(maitre, tailleArt, tailleArt);
  const avant = new PNG({ width: 1024, height: 1024 });
  coller(avant, art, Math.round((1024 - tailleArt) / 2), Math.round((1024 - tailleArt) / 2));

  // --- Calque arrière-plan : dégradé vertical prolongé du badge ---
  // Pour chaque ligne, le premier pixel opaque (toujours le bord gauche du
  // badge, jamais traversé par l'artwork) donne la couleur du dégradé ; en
  // dehors du badge, la couleur du bord le plus proche se prolonge → le
  // squircle fond dans le fond sans couture, quelle que soit la forme du
  // masque Android.
  const fond = new PNG({ width: 1024, height: 1024 });
  for (let y = 0; y < 1024; y++) {
    const srcY = Math.max(minY, Math.min(maxY, minY + ((y + 0.5) / 1024) * (maxY - minY)));
    const ligne = Math.floor(srcY) * maitre.width * 4;
    let si = ligne;
    for (let x = 0; x < maitre.width; x++) {
      if (maitre.data[ligne + x * 4 + 3] > 10) {
        si = ligne + x * 4;
        break;
      }
    }
    for (let x = 0; x < 1024; x++) {
      const di = (y * 1024 + x) * 4;
      fond.data[di] = maitre.data[si];
      fond.data[di + 1] = maitre.data[si + 1];
      fond.data[di + 2] = maitre.data[si + 2];
      fond.data[di + 3] = 255;
    }
  }

  const favicon = redimensionner(maitre, 64, 64);
  const logo512 = redimensionner(maitre, 512, 512);
  const logo384 = redimensionner(maitre, 384, 384);
  const logo256 = redimensionner(maitre, 256, 256);

  console.log("\nSources canoniques (assets/icons/) :");
  ecrire(avant, path.join(RACINE, "assets/icons/hotelsaver-foreground.png"));
  ecrire(fond, path.join(RACINE, "assets/icons/hotelsaver-background.png"));
  ecrire(favicon, path.join(RACINE, "assets/icons/hotelsaver-favicon.png"));
  ecrire(logo512, path.join(RACINE, "assets/icons/desktop/icon.png"));
  ecrireIco(logo256, path.join(RACINE, "assets/icons/desktop/icon.ico"));

  console.log("\nMobile (apps/mobile/assets/) :");
  ecrire(maitre, path.join(RACINE, "apps/mobile/assets/icon.png"));
  ecrire(avant, path.join(RACINE, "apps/mobile/assets/android-icon-foreground.png"));
  ecrire(fond, path.join(RACINE, "apps/mobile/assets/android-icon-background.png"));
  ecrire(maitre, path.join(RACINE, "apps/mobile/assets/splash-icon.png"));
  ecrire(favicon, path.join(RACINE, "apps/mobile/assets/favicon.png"));
  ecrire(logo512, path.join(RACINE, "apps/mobile/assets/hotelsaver-logo.png"));

  console.log("\nWeb public + Super-Admin (public/) :");
  for (const appDir of ["apps/web", "apps/super-admin"]) {
    ecrire(favicon, path.join(RACINE, appDir, "public/favicon.png"));
    ecrire(logo384, path.join(RACINE, appDir, "public/logo-hotelsaver.png"));
  }

  console.log("\nDesktop (resources/, convention electron-vite) :");
  ecrire(logo512, path.join(RACINE, "apps/desktop/resources/icon.png"));
  ecrireIco(logo256, path.join(RACINE, "apps/desktop/resources/icon.ico"));
}

main();
