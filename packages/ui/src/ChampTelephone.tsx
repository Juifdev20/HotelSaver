import * as React from "react";
import { INDICATIF_RDC, formaterSaisieRdc, normaliserTelephoneRdc } from "@hotel-chicago/types";
import "./champ-telephone.css";

/** Numéro normalisé (« +243XXXXXXXXX ») à partir de la saisie du champ, ou null. */
export function telephoneDepuisSaisie(saisie: string): string | null {
  return normaliserTelephoneRdc(`${INDICATIF_RDC}${saisie.replace(/\D/g, "").replace(/^0/, "")}`);
}

/** Saisie du champ (« 970 000 000 ») à partir d'un numéro normalisé « +243970000000 ». */
export function saisieDepuisTelephone(telephone: string | null | undefined): string {
  return telephone ? formaterSaisieRdc(telephone.slice(INDICATIF_RDC.length)) : "";
}

/** Drapeau de la RDC : bleu ciel, étoile jaune, diagonale rouge bordée de jaune. */
export function DrapeauRdc({ largeur = 24 }: { largeur?: number }) {
  return (
    <svg width={largeur} height={(largeur * 3) / 4} viewBox="0 0 800 600" aria-hidden="true">
      <rect width="800" height="600" fill="#007FFF" />
      <path d="M0 450 L600 0 L800 0 L800 150 L200 600 L0 600 Z" fill="#F7D618" />
      <path d="M0 525 L700 0 L800 0 L800 75 L100 600 L0 600 Z" fill="#CE1021" />
      <polygon
        points="140,25 163.5,92.6 235.1,94.1 178,137.4 198.8,205.9 140,165 81.2,205.9 102,137.4 44.9,94.1 116.5,92.6"
        fill="#F7D618"
      />
    </svg>
  );
}

export interface ChampTelephoneProps {
  id: string;
  /** Saisie formatée « 970 000 000 » (sans l'indicatif). */
  value: string;
  onChange: (saisie: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}

/**
 * Champ « Numéro de téléphone » (connexion par numéro, 15/10/2026) : pays
 * (RDC 🇨🇩, seul proposé pour l'instant) + indicatif « +243 » + saisie
 * formatée par groupes de trois chiffres. Le libellé reste à la charge de
 * l'écran (`<label htmlFor={id}>`), comme pour les autres champs.
 */
export function ChampTelephone({ id, value, onChange, required, autoFocus, placeholder = "970 000 000" }: ChampTelephoneProps) {
  return (
    <div className="hc-champ-telephone">
      <span className="hc-champ-telephone__pays" title="République démocratique du Congo">
        <DrapeauRdc />
        <span>{INDICATIF_RDC}</span>
      </span>
      <input
        id={id}
        className="hc-champ-telephone__saisie"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={value}
        onChange={(e) => onChange(formaterSaisieRdc(e.target.value))}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        maxLength={11}
      />
    </div>
  );
}
