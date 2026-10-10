// Marque dist/esm comme un contexte ESM (dist/cjs reste implicitement
// CommonJS car aucun package.json "type" n'est déclaré à la racine) —
// nécessaire pour qu'un bundler/Node distingue les deux dossiers de sortie
// du même paquet (double publication CJS + ESM, voir DECISIONS.md).
const fs = require("fs");
const path = require("path");

fs.copyFileSync(path.join(__dirname, "..", "esm-package.json"), path.join(__dirname, "..", "dist", "esm", "package.json"));

console.log("dist/esm/package.json écrit (type: module).");
