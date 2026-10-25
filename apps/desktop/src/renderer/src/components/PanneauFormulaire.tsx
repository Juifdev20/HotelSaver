import * as React from "react";
import { useId } from "react";
import { X } from "lucide-react";
import { useDialogue } from "@hotel-chicago/ui";

export interface PanneauFormulaireProps {
  titre: string;
  sousTitre?: string;
  /** Appelé par la croix, la touche Échap et un clic sur le fond. */
  onFermer: () => void;
  /** Message d'erreur de la saisie, montré dans le panneau (la page derrière est masquée). */
  erreur?: string | null;
  /** Boutons d'action (Enregistrer, Annuler…) : fixés en bas du panneau, toujours visibles. */
  actions: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Formulaire de saisie en panneau latéral (à droite), comme dans un logiciel de bureau : la liste reste visible derrière,
 * le formulaire défile seul et les boutons restent toujours en vue. Clavier : Échap ferme, Tab reste dans le panneau.
 * À placer dans un `<form onSubmit>` côté appelant si Entrée doit enregistrer (les `actions` peuvent contenir le bouton « submit »).
 */
export function PanneauFormulaire({ titre, sousTitre, onFermer, erreur, actions, children }: PanneauFormulaireProps) {
  const idTitre = useId();
  const ref = useDialogue<HTMLDivElement>({ onEchap: onFermer });
  return (
    <div className="panneau-fond" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div ref={ref} className="panneau" role="dialog" aria-modal="true" aria-labelledby={idTitre}>
        <header className="panneau__entete">
          <div>
            <h2 id={idTitre} className="hc-text-subheading">
              {titre}
            </h2>
            {sousTitre && <p className="hc-text-caption texte-discret">{sousTitre}</p>}
          </div>
          <button type="button" className="panneau__fermer" onClick={onFermer} aria-label="Fermer">
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="panneau__corps formulaire">
          {erreur && (
            <p role="alert" className="hc-text-body texte-erreur panneau__erreur">
              {erreur}
            </p>
          )}
          {children}
        </div>
        <footer className="panneau__pied">{actions}</footer>
      </div>
    </div>
  );
}
