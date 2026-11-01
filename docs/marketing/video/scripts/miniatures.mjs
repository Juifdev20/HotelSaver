// Miniatures : node scripts/miniatures.mjs → sortie/miniatures/ (YouTube 1280×720 + verticale 1080×1920)
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
const NAV = process.env.NAVIGATEUR || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'sortie', 'miniatures');
fs.mkdirSync(dossier, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(racine, 'src/index.ts'), publicDir: path.join(racine, 'public') });
for (const [id, nom] of [['Miniature-YouTube', 'HotelSaver-miniature-youtube'], ['Miniature-Verticale', 'HotelSaver-miniature-verticale']]) {
  const composition = await selectComposition({ serveUrl, id, browserExecutable: NAV });
  for (const fmt of ['png', 'jpeg']) {
    const out = path.join(dossier, `${nom}.${fmt === 'jpeg' ? 'jpg' : 'png'}`);
    await renderStill({ composition, serveUrl, frame: 0, output: out, imageFormat: fmt, ...(fmt === 'jpeg' ? { jpegQuality: 92 } : {}), browserExecutable: NAV });
    console.log('✔', out, Math.round(fs.statSync(out).size / 1024), 'Ko');
  }
}
