import * as React from "react";
import { Hammer } from "lucide-react";

/** Écran prévu mais pas encore construit : on le dit clairement plutôt que d'afficher un écran vide. */
export function EcranBientot({ titre }: { titre: string }) {
  return (
    <div className="page">
      <header className="page__entete">
        <h1 className="hc-text-display-md page__titre">{titre}</h1>
      </header>
      <div className="etat-vide" data-testid="ecran-bientot">
        <Hammer size={32} strokeWidth={1.5} aria-hidden="true" />
        <p className="hc-text-subheading">Cet écran arrive bientôt</p>
        <p className="hc-text-body texte-discret">
          Le serveur sait déjà gérer cette partie ; l'écran de l'application est en cours de construction.
        </p>
      </div>
    </div>
  );
}
