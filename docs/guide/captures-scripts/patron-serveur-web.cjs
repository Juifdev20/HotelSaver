/** Sert le site web compilé (apps/web, VITE_API_URL=http://127.0.0.1:40001) avec repli sur index.html : node patron-serveur-web.cjs <dossier> <port> */
const { createServer } = require("node:http");
const { existsSync, readFileSync, statSync } = require("node:fs");
const { extname, join } = require("node:path");
const [dossier, port] = [process.argv[2], Number(process.argv[3] ?? 40020)];
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".webp": "image/webp" };
createServer((req, res) => {
  const chemin = join(dossier, decodeURIComponent((req.url ?? "/").split("?")[0]));
  const f = existsSync(chemin) && statSync(chemin).isFile() ? chemin : join(dossier, "index.html");
  res.writeHead(200, { "Content-Type": T[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
}).listen(port, "127.0.0.1", () => console.log("site web sur", port));
