import * as React from "react";
import type { LigneRecu } from "@hotel-chicago/receipts";

/**
 * Aperçu d'un reçu : le MÊME `LigneRecu[]` que celui envoyé à l'imprimante, affiché comme un ticket
 * (papier blanc, police à chasse fixe) — ce que la cafétaria voit est exactement ce qui sort imprimé.
 */
export function ApercuRecu({ lignes }: { lignes: LigneRecu[] }) {
  return (
    <div className="apercu-recu" role="img" aria-label="Aperçu du reçu">
      {lignes.map((ligne, i) => {
        switch (ligne.type) {
          case "titre":
            return (
              <p key={i} className="apercu-recu__centre apercu-recu__gras apercu-recu__titre">
                {ligne.texte}
              </p>
            );
          case "soustitre":
            return (
              <p key={i} className="apercu-recu__centre">
                {ligne.texte}
              </p>
            );
          case "separateur":
            return <hr key={i} className="apercu-recu__separateur" />;
          case "champ":
            return (
              <p key={i}>
                {ligne.label} : {ligne.valeur}
              </p>
            );
          case "montant":
            return (
              <p key={i} className="apercu-recu__montant">
                <span>{ligne.libelle}</span>
                <span className="apercu-recu__gras">{ligne.valeur}</span>
              </p>
            );
          case "codebarre":
            // L'imprimante dessine les barres elle-même ; l'aperçu montre le code.
            return (
              <p key={i} className="apercu-recu__centre apercu-recu__gras" style={{ letterSpacing: 2 }}>
                ▌▍▌▌▍ {ligne.valeur} ▍▌▌▍▌
              </p>
            );
        }
      })}
    </div>
  );
}
