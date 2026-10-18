import * as React from "react";

export interface CarteChoixProps {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  titre: string;
  detail?: string;
  /** Logo(s) affiché(s) dans la carte (réseau Mobile Money, cartes acceptées). */
  visuel?: React.ReactNode;
  /** Carte de réseau : logo au-dessus du nom, en grille. */
  compact?: boolean;
  disabled?: boolean;
}

/** Carte à cocher : un vrai bouton radio (clavier, flèches, lecteur d'écran) habillé en carte. Partagée par l'acompte d'une réservation
 * et le paiement de l'abonnement (même présentation des moyens de paiement, 17/10/2026). Styles : `paiement/suivi.css`. */
export function CarteChoix({ name, value, checked, onChange, titre, detail, visuel, compact = false, disabled = false }: CarteChoixProps) {
  return (
    <label className={`acompte-choix ${compact ? "acompte-choix--compact" : ""} ${checked ? "acompte-choix--actif" : ""}`}>
      <input type="radio" className="acompte-choix__radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} />
      <span className="acompte-choix__corps">
        {visuel && <span className="acompte-choix__visuel">{visuel}</span>}
        <span className="acompte-choix__textes">
          <strong>{titre}</strong>
          {detail && <small>{detail}</small>}
        </span>
        <span className="acompte-choix__coche" aria-hidden="true" />
      </span>
    </label>
  );
}
