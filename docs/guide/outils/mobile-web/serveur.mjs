// Sert dist/ (l'application mobile compilée pour le web) sur un port local. Usage : node serveur.mjs <port> [fichierArret]
// S'arrête tout seul si le fichier d'arrêt apparaît (même principe que hote.sh).
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "dist");
const port = Number(process.argv[2] ?? 40404);
const arret = process.argv[3];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".svg": "image/svg+xml" };

createServer((req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let fichier = normalize(join(DIST, chemin === "/" ? "index.html" : chemin));
  if (!fichier.startsWith(DIST) || !existsSync(fichier)) fichier = join(DIST, "index.html"); // repli : l'application gère ses écrans
  res.writeHead(200, { "Content-Type": TYPES[extname(fichier)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  res.end(readFileSync(fichier));
}).listen(port, "127.0.0.1", () => console.log(`mobile-web : http://127.0.0.1:${port}/`));

if (arret) setInterval(() => existsSync(arret) && process.exit(0), 1000);
