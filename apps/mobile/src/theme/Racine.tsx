import * as React from "react";
import App from "../../App";
import { FournisseurApparence } from "./ContexteApparence";

/** Racine de l'application : le thème (Auto / Clair / Sombre) enveloppe tout, y compris l'écran de connexion. */
export function Racine() {
  return (
    <FournisseurApparence>
      <App />
    </FournisseurApparence>
  );
}
