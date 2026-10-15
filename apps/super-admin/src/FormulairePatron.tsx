import * as React from "react";
import { useState } from "react";
import { Button, ChampTelephone, saisieDepuisTelephone, telephoneDepuisSaisie } from "@hotel-chicago/ui";
import type { HotelAvecValidite } from "@hotel-chicago/types";

export interface FormulairePatronProps {
  hotel: HotelAvecValidite;
  enCours: boolean;
  erreur: string | null;
  onSoumettre: (dto: { telephone?: string; motDePasse?: string }) => void;
  onFermer: () => void;
}

/** Accès du patron d'un hôtel (connexion par numéro, 15/10/2026) : poser son
 * numéro de connexion (comptes antérieurs) et/ou lui donner un nouveau mot de
 * passe quand il l'a oublié sans e-mail — c'est le recours « contactez le
 * support HotelSaver » affiché dans les applications. */
export function FormulairePatron({ hotel, enCours, erreur, onSoumettre, onFermer }: FormulairePatronProps) {
  const numeroActuel = hotel.patron?.telephone ?? null;
  const [telephone, setTelephone] = useState(saisieDepuisTelephone(numeroActuel));
  const [motDePasse, setMotDePasse] = useState("");
  const [erreurLocale, setErreurLocale] = useState<string | null>(null);

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    const dto: { telephone?: string; motDePasse?: string } = {};
    if (telephone.trim()) {
      const numero = telephoneDepuisSaisie(telephone);
      if (!numero) return setErreurLocale("Numéro invalide : 9 chiffres commençant par 8 ou 9.");
      if (numero !== numeroActuel) dto.telephone = numero;
    }
    if (motDePasse) {
      if (motDePasse.length < 8) return setErreurLocale("Le mot de passe doit contenir au moins 8 caractères.");
      dto.motDePasse = motDePasse;
    }
    if (!dto.telephone && !dto.motDePasse) return setErreurLocale("Rien à modifier.");
    setErreurLocale(null);
    onSoumettre(dto);
  }

  return (
    <div className="fond-modale" onClick={onFermer}>
      <form className="carte carte--etroite" onClick={(e) => e.stopPropagation()} onSubmit={soumettre}>
        <h2 className="titre">Accès du patron</h2>
        <p className="sous-titre">
          {hotel.nom}
          {hotel.patron ? ` — ${hotel.patron.nom}` : ""}
        </p>

        <label className="label" htmlFor="telephone-patron">
          Numéro de connexion
        </label>
        <ChampTelephone id="telephone-patron" value={telephone} onChange={setTelephone} />

        <label className="label" htmlFor="mdp-patron">
          Nouveau mot de passe (optionnel)
        </label>
        <input
          id="mdp-patron"
          className="champ"
          type="text"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          placeholder="Laisser vide pour ne pas le changer"
          autoComplete="off"
        />

        {(erreurLocale ?? erreur) && (
          <p className="erreur" role="alert">
            {erreurLocale ?? erreur}
          </p>
        )}

        <Button type="submit" disabled={enCours} style={{ width: "100%", marginTop: 16 }}>
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <button type="button" className="lien-discret" onClick={onFermer}>
          Annuler
        </button>
      </form>
    </div>
  );
}
