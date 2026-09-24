// tsc ne copie pas les .css : on copie TOUS ceux de src/ (pas une liste figée,
// trop facile à oublier en ajoutant un composant).
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "src");
const dist = path.join(__dirname, "..", "dist");
const fichiers = fs.readdirSync(src).filter((fichier) => fichier.endsWith(".css"));

for (const fichier of fichiers) {
  fs.copyFileSync(path.join(src, fichier), path.join(dist, fichier));
}

console.log(`Copié ${fichiers.length} fichiers CSS vers dist/.`);
