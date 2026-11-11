import * as React from "react";
import { useEffect, useId, useState } from "react";
import { Banknote, CircleCheck, Clock, X } from "lucide-react";
import { Button, useDialogue } from "@hotel-chicago/ui";

export interface DialogueCreerTableProps {
  nomInitial: string;
  articles: number;
  /** Total des articles choisis, pour le bouton « Encaisser … ». */
  totalLibelle: string;
  onFermer: () => void;
  onValider: (choix: { nom: string; payerMaintenant: boolean }) => void;
  enCours: boolean;
  erreur: string | null;
}

/** « Il reste » : une seule question de nom, puis payer les articles choisis maintenant ou à la fin. */
export function DialogueCreerTable({ nomInitial, articles, totalLibelle, onFermer, onValider, enCours, erreur }: DialogueCreerTableProps) {
  const idTitre = useId();
  const [nom, setNom] = useState(nomInitial);
  const [payerMaintenant, setPayerMaintenant] = useState(true);
  const ref = useDialogue<HTMLFormElement>({ onEchap: () => !enCours && onFermer() });
  useEffect(() => setNom(nomInitial), [nomInitial]);
  const valide = nom.trim().length > 0;

  const Option = ({ valeur, titre, sous, Icone }: { valeur: boolean; titre: string; sous: string; Icone: typeof Banknote }) => (
    <label className={`vente-option${payerMaintenant === valeur ? " vente-option--choisie" : ""}`}>
      <input type="radio" name="paiement-table" checked={payerMaintenant === valeur} onChange={() => setPayerMaintenant(valeur)} />
      <span className="vente-option__texte">
        <strong>{titre}</strong>
        <span>{sous}</span>
      </span>
      <Icone size={22} aria-hidden="true" />
    </label>
  );

  return (
    <div className="dialogue-fond" onMouseDown={(e) => e.target === e.currentTarget && !enCours && onFermer()}>
      <form
        ref={ref}
        className="dialogue vente-dialogue"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        onSubmit={(e) => {
          e.preventDefault();
          if (valide && !enCours) onValider({ nom: nom.trim(), payerMaintenant });
        }}
      >
        <div className="vente-dialogue__entete">
          <h2 id={idTitre} className="hc-text-heading">
            Créer sa table
          </h2>
          <button type="button" className="vente-fermer" onClick={onFermer} disabled={enCours} aria-label="Fermer">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <label className="vente-etiquette" htmlFor="vente-nom-table">
          Nom de la table ou du client
        </label>
        <input
          id="vente-nom-table"
          className="vente-champ"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          maxLength={60}
          autoFocus
          data-autofocus
          onFocus={(e) => e.currentTarget.select()}
          placeholder="Ex. Table 4"
        />
        <p className="vente-etiquette">
          Les {articles} article{articles > 1 ? "s" : ""} choisi{articles > 1 ? "s" : ""} sont…
        </p>
        <div className="vente-options" role="radiogroup" aria-label="Paiement des articles choisis">
          <Option valeur titre="À payer maintenant" sous="Le reçu s'imprime, la table reste ouverte pour la suite" Icone={Banknote} />
          <Option valeur={false} titre="À payer à la fin" sous="Ils sont mis sur la table, rien n'est payé" Icone={Clock} />
        </div>
        {erreur && (
          <p role="alert" className="vente-erreur">
            {erreur}
          </p>
        )}
        <div className="dialogue__actions">
          <Button type="button" variant="secondary" onClick={onFermer} disabled={enCours}>
            Annuler
          </Button>
          <Button type="submit" disabled={!valide || enCours}>
            <CircleCheck size={18} aria-hidden="true" /> {enCours ? "…" : payerMaintenant ? `Encaisser ${totalLibelle}` : "Créer la table"}
          </Button>
        </div>
      </form>
    </div>
  );
}
