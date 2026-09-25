// Marque dist/esm comme un contexte ESM (dist/cjs reste implicitement
// CommonJS car aucun package.json "type" n'est déclaré à la racine) —
// même patron que packages/types. Nécessaire depuis que packages/sync-engine
// dépend de ce paquet ET tourne sous Jest/ts-jest (CommonJS) : sans un
// dist/cjs distinct, Node essayait de `require()` le build ESM et échouait
// sur `export` (syntaxe non reconnue en CommonJS).
const fs = require("fs");
const path = require("path");

fs.copyFileSync(path.join(__dirname, "..", "esm-package.json"), path.join(__dirname, "..", "dist", "esm", "package.json"));

console.log("dist/esm/package.json écrit (type: module).");
