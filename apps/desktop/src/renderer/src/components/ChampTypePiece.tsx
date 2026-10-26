import * as React from "react";
import { TYPE_PIECE_AUTRE, TYPES_PIECE_IDENTITE, typePieceDeLaListe } from "@hotel-chicago/types";

export interface ChampTypePieceProps {
  id: string;
  /** Texte enregistré (libellé de la liste, ou texte libre pour une pièce hors liste). */
  valeur: string;
  onChange: (valeur: string) => void;
  libelle?: string;
}

/**
 * Choix de la pièce d'identité dans une liste (carte d'électeur, passeport, visa…) pour aller vite à la réception ; « Autre » laisse
 * écrire une pièce qui n'est pas dans la liste. Une ancienne saisie libre reconnue (« CNI ») est retrouvée dans la liste.
 */
export function ChampTypePiece({ id, valeur, onChange, libelle = "Type de pièce (optionnel)" }: ChampTypePieceProps) {
  const [autre, setAutre] = React.useState(() => valeur.trim() !== "" && typePieceDeLaListe(valeur) === null);
  const dansLaListe = typePieceDeLaListe(valeur);
  const selection = autre ? TYPE_PIECE_AUTRE : (dansLaListe ?? "");

  return (
    <div className="champ">
      <label className="hc-text-label" htmlFor={id}>
        {libelle}
      </label>
      <select
        id={id}
        value={selection}
        onChange={(e) => {
          const choix = e.target.value;
          if (choix === TYPE_PIECE_AUTRE) {
            setAutre(true);
            if (dansLaListe) onChange("");
          } else {
            setAutre(false);
            onChange(choix);
          }
        }}
      >
        <option value="">— Choisir —</option>
        {TYPES_PIECE_IDENTITE.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
        <option value={TYPE_PIECE_AUTRE}>{TYPE_PIECE_AUTRE} (préciser)</option>
      </select>
      {autre && (
        <input
          type="text"
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nom de la pièce"
          aria-label="Nom de la pièce d'identité"
          style={{ marginTop: "var(--hc-space-2)" }}
        />
      )}
    </div>
  );
}
