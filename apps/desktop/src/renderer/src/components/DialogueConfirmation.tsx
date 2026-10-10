import * as React from "react";
import { useCallback, useId, useRef, useState } from "react";
import { Button, useDialogue } from "@hotel-chicago/ui";

export interface OptionsConfirmation {
  /** Question posée, précise : quoi, qui, combien (ex. « Facturer 120,00 $ en espèces ? »). */
  titre: string;
  /** Détail facultatif sous le titre (conséquences, caractère irréversible…). */
  message?: React.ReactNode;
  /** Libellé du bouton de confirmation : un verbe précis, jamais « Oui » / « OK ». */
  libelleConfirmer: string;
  /** Action destructrice : bouton rouge. */
  destructif?: boolean;
}

function Dialogue({
  options,
  onChoix,
}: {
  options: OptionsConfirmation;
  onChoix: (confirme: boolean) => void;
}) {
  const idTitre = useId();
  const idMessage = useId();
  const ref = useDialogue<HTMLDivElement>({ onEchap: () => onChoix(false) });
  return (
    <div className="dialogue-fond" onMouseDown={(e) => e.target === e.currentTarget && onChoix(false)}>
      <div
        ref={ref}
        className="dialogue"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        aria-describedby={options.message ? idMessage : undefined}
      >
        <h2 id={idTitre} className="hc-text-subheading">
          {options.titre}
        </h2>
        {options.message && (
          <div id={idMessage} className="hc-text-body texte-discret">
            {options.message}
          </div>
        )}
        <div className="dialogue__actions">
          <Button type="button" variant="secondary" data-autofocus onClick={() => onChoix(false)}>
            Annuler
          </Button>
          <Button type="button" variant={options.destructif ? "danger" : "primary"} onClick={() => onChoix(true)}>
            {options.libelleConfirmer}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirmation avant une action irréversible ou monétaire. Remplace `window.confirm`
 * (qui vole le focus du clavier sous Electron et ne peut pas être stylé) :
 *
 *   const { demander, dialogue } = useConfirmation();
 *   if (!(await demander({ titre: "Facturer 120,00 $ en espèces ?", libelleConfirmer: "Facturer" }))) return;
 *   …
 *   return <>…{dialogue}</>;
 *
 * Le focus initial est sur « Annuler » (choix sûr) ; Échap annule.
 */
export function useConfirmation() {
  const [options, setOptions] = useState<OptionsConfirmation | null>(null);
  const resolveur = useRef<((confirme: boolean) => void) | null>(null);

  const demander = useCallback((o: OptionsConfirmation) => {
    return new Promise<boolean>((resolve) => {
      resolveur.current?.(false); // une confirmation déjà ouverte est annulée
      resolveur.current = resolve;
      setOptions(o);
    });
  }, []);

  const choisir = useCallback((confirme: boolean) => {
    resolveur.current?.(confirme);
    resolveur.current = null;
    setOptions(null);
  }, []);

  const dialogue = options ? <Dialogue options={options} onChoix={choisir} /> : null;
  return { demander, dialogue };
}
