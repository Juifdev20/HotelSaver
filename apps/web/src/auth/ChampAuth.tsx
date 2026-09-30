import * as React from "react";
import { useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ChampAuthProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  id: string;
  libelle: string;
  icone: LucideIcon;
  valeur: string;
  onChange: (valeur: string) => void;
  /** Coche verte quand la valeur est valide. */
  valide?: boolean;
  /** Texte collé à droite du champ (ex. « .hotelsaver.com »). */
  suffixe?: string;
  aide?: string;
}

/** Champ avec icône à gauche, coche de validation et, pour un mot de passe,
 * bouton afficher/masquer — comme la maquette d'inscription/connexion. */
export function ChampAuth({ id, libelle, icone: Icone, valeur, onChange, valide, suffixe, aide, type, ...reste }: ChampAuthProps) {
  const [visible, setVisible] = useState(false);
  const estMotDePasse = type === "password";

  return (
    <div className="champ-auth">
      <label htmlFor={id}>{libelle}</label>
      <div className="champ-auth__boite">
        <Icone size={18} className="champ-auth__icone" aria-hidden="true" />
        <input
          id={id}
          {...reste}
          type={estMotDePasse && visible ? "text" : type}
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffixe && <span className="champ-auth__suffixe">{suffixe}</span>}
        {valide && !estMotDePasse && <Check size={18} className="champ-auth__ok" aria-label="Valide" />}
        {estMotDePasse && (
          <button
            type="button"
            className="champ-auth__oeil"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {aide && <small className="champ-auth__aide">{aide}</small>}
    </div>
  );
}
