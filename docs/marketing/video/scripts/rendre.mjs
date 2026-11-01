// Rend la vidéo HotelSaver : node scripts/rendre.mjs [9x16|16x9|1x1 ...]  (par défaut les trois formats)
// Sorties dans sortie/ : un MP4 par format (voix comprise), les sous-titres .srt et la voix seule (.mp3) pour le montage.
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const NAV = process.env.NAVIGATEUR || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const racine = path.resolve(import.meta.dirname, '..');
const sortie = path.join(racine, 'sortie');
fs.mkdirSync(sortie, { recursive: true });
const formats = process.argv.slice(2).length ? process.argv.slice(2) : ['9x16', '16x9', '1x1'];

const serveUrl = await bundle({ entryPoint: path.join(racine, 'src/index.ts'), publicDir: path.join(racine, 'public') });
for (const f of formats) {
  const id = `HotelSaver-${f}`;
  const composition = await selectComposition({ serveUrl, id, browserExecutable: NAV });
  const fichier = path.join(sortie, `${id}.mp4`);
  let dernier = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 18,
    audioBitrate: '192k',
    pixelFormat: 'yuv420p',
    outputLocation: fichier,
    browserExecutable: NAV,
    concurrency: Number(process.env.CONCURRENCE || 3),
    onProgress: ({ progress }) => {
      const p = Math.floor(progress * 10);
      if (p !== dernier) {
        dernier = p;
        console.log(`${id} ${p * 10} %`);
      }
    },
  });
  console.log('✔', fichier);
}

// Sous-titres et voix seule, pour qui veut remonter la vidéo avec sa propre musique.
const require = createRequire(import.meta.url);
const t = require(path.join(racine, 'src/timeline.json'));
fs.copyFileSync(path.join(racine, 'public/voix/voix_off.mp3'), path.join(sortie, 'HotelSaver-voix-off.mp3'));
console.log('✔ voix seule, durée', t.total, 's');
const { build } = await import('esbuild');
const tmp = path.join(racine, '.cache', 'sous-titres.mjs');
await build({ entryPoints: [path.join(racine, 'src/sousTitres.ts')], bundle: true, format: 'esm', platform: 'node', outfile: tmp, logLevel: 'silent' });
const { versSrt } = await import(tmp);
fs.writeFileSync(path.join(sortie, 'HotelSaver-sous-titres.srt'), versSrt());
console.log('✔ sous-titres .srt');

// Voix + bruitages (sans musique), tirés du rendu 9:16 : la piste à poser sous votre propre musique.
const { execFileSync } = await import('node:child_process');
const ref = path.join(sortie, 'HotelSaver-9x16.mp4');
if (fs.existsSync(ref)) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', ref, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', path.join(sortie, 'HotelSaver-voix-et-bruitages.mp3')]);
  console.log('✔ voix + bruitages .mp3');
}
