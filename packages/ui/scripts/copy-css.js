const fs = require("fs");
const path = require("path");

const fichiers = ["tokens.css", "typography.css", "button.css", "status-badge.css", "room-card.css"];

for (const fichier of fichiers) {
  fs.copyFileSync(path.join(__dirname, "..", "src", fichier), path.join(__dirname, "..", "dist", fichier));
}

console.log(`Copié ${fichiers.length} fichiers CSS vers dist/.`);
