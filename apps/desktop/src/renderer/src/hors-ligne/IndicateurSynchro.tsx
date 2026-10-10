import * as React from "react";
import { resumerEtatSync, type EtatSync } from "@hotel-chicago/sync-engine";

export interface IndicateurSynchroProps {
  etat: EtatSync | null;
  /** Jours avant qu'une reconnexion à Internet devienne obligatoire (session ouverte hors ligne). */
  joursRestants?: number | null;
  onOuvrir: () => void;
}

/**
 * État RÉEL de la synchronisation, dans l'en-tête de l'application : jamais « à jour » tant qu'il reste des actions à envoyer, qu'une
 * action a été refusée, qu'un conflit attend ou que la dernière synchronisation a échoué. Couleur + mot, jamais la couleur seule.
 */
export function IndicateurSynchro({ etat, joursRestants, onOuvrir }: IndicateurSynchroProps) {
  const resume = etat ? resumerEtatSync(etat) : { niveau: "attente" as const, titre: "Démarrage…", detail: "Ouverture de la base locale." };
  const alerteDelai = joursRestants !== null && joursRestants !== undefined && joursRestants <= 3;
  return (
    <button
      type="button"
      className={`indicateur-synchro indicateur-synchro--${resume.niveau}`}
      onClick={onOuvrir}
      title={`${resume.detail}${alerteDelai ? ` Reconnexion à Internet obligatoire dans ${joursRestants} jour(s).` : ""}`}
      data-testid="indicateur-synchro"
    >
      {/* Le rôle « status » ne peut pas être posé sur le bouton (il perdrait son rôle de bouton) : l'état est annoncé par un texte à part. */}
      <span role="status" className="visuellement-cache">
        {resume.titre}. {resume.detail}
      </span>
      <span className="indicateur-synchro__point" aria-hidden="true" />
      <span className="hc-text-caption" aria-hidden="true">{resume.titre}</span>
      {alerteDelai && <span className="hc-text-caption indicateur-synchro__delai">· reconnexion dans {joursRestants} j</span>}
    </button>
  );
}
