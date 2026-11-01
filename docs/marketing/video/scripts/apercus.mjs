// Images de contrôle : node scripts/apercus.mjs <composition> <dossier> <images...>
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
const NAV = process.env.NAVIGATEUR || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const [id, dossier, ...images] = process.argv.slice(2);
const racine = path.resolve(import.meta.dirname, '..');
const serveUrl = await bundle({ entryPoint: path.join(racine, 'src/index.ts'), publicDir: path.join(racine, 'public') });
const composition = await selectComposition({ serveUrl, id, browserExecutable: NAV });
fs.mkdirSync(dossier, { recursive: true });
for (const f of images.map(Number)) {
  await renderStill({ composition, serveUrl, frame: f, output: path.join(dossier, `${id}-${String(f).padStart(4, '0')}.jpg`), imageFormat: 'jpeg', jpegQuality: 70, browserExecutable: NAV, scale: 0.5 });
  console.log('ok', f);
}
