import * as React from "react";
import { useId } from "react";
import { Button, useDialogue } from "@hotel-chicago/ui";

export interface DialogueConfirmationProps {
  /** Question précise : quoi, pour qui (ex. « Passer l'hôtel Chicago en SUSPENDU ? »). */
  titre: string;
  message?: React.ReactNode;
  /** Verbe précis, jamais « Oui » / « OK ». */
  libelleConfirmer: string;
  destructif?: boolean;
  enCours?: boolean;
  onConfirmer: () => void;
  onAnnuler: () => void;
}

/**
 * Confirmation avant une action grave (changer la licence d'un hôtel, retirer un domaine).
 * Le focus initial est sur « Annuler » (choix sûr) ; Échap annule ; le focus est piégé dans la fenêtre.
 */
export function DialogueConfirmation({ titre, message, libelleConfirmer, destructif, enCours, onConfirmer, onAnnuler }: DialogueConfirmationProps) {
  const idTitre = useId();
  const idMessage = useId();
  const ref = useDialogue<HTMLDivElement>({ onEchap: onAnnuler });
  return (
    <div className="fond-modale fond-modale--confirmation" onMouseDown={(e) => e.target === e.currentTarget && onAnnuler()}>
      <div
        ref={ref}
        className="carte carte--etroite"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        aria-describedby={message ? idMessage : undefined}
      >
        <h2 id={idTitre} className="titre titre--moyen">
          {titre}
        </h2>
        {message && (
          <div id={idMessage} className="texte-confirmation">
            {message}
          </div>
        )}
        <div className="actions-confirmation">
          <Button type="button" variant="secondary" data-autofocus onClick={onAnnuler} disabled={enCours}>
            Annuler
          </Button>
          <Button type="button" variant={destructif ? "danger" : "primary"} onClick={onConfirmer} disabled={enCours}>
            {libelleConfirmer}
          </Button>
        </div>
      </div>
    </div>
  );
}
