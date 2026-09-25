// Même patron que packages/api-client et packages/types : marque dist/esm
// comme un contexte ESM (dist/cjs reste implicitement CommonJS).
const fs = require("fs");
const path = require("path");

fs.copyFileSync(path.join(__dirname, "..", "esm-package.json"), path.join(__dirname, "..", "dist", "esm", "package.json"));

console.log("dist/esm/package.json écrit (type: module).");
