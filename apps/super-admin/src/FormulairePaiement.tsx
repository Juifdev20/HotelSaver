import * as React from "react";
import { useState } from "react";
import { Button } from "@hotel-chicago/ui";
import type { DonneesEnregistrementPaiement } from "@hotel-chicago/api-client";
import { Devise, MethodePaiementLicence } from "@hotel-chicago/types";
import type { HotelAvecValidite } from "@hotel-chicago/types";

export interface FormulairePaiementProps {
  hotel: HotelAvecValidite;
  enCours: boolean;
  erreur: string | null;
  onSoumettre: (dto: DonneesEnregistrementPaiement) => void;
  onFermer: () => void;
}

/** Enregistrer un paiement réactive TOUJOURS l'hôtel (voir DECISIONS.md,
 * Phase 12) — pas de champ "statut" ici, ce n'est pas ce formulaire qui le
 * décide, c'est une conséquence automatique côté serveur. */
export function FormulairePaiement({ hotel, enCours, erreur, onSoumettre, onFermer }: FormulairePaiementProps) {
  const [montant, setMontant] = useState("");
  const [devise, setDevise] = useState<Devise>(Devise.USD);
  const [methode, setMethode] = useState<MethodePaiementLicence>(MethodePaiementLicence.MOBILE_MONEY);
  const [periodeCouverteJusquau, setPeriodeCouverteJusquau] = useState("");
  const [note, setNote] = useState("");
  const [erreurLocale, setErreurLocale] = useState<string | null>(null);

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    const montantNombre = Number(montant);
    if (!montantNombre || montantNombre <= 0) return setErreurLocale("Le montant doit être un nombre positif.");
    if (!periodeCouverteJusquau) return setErreurLocale("La date de fin de période est obligatoire.");

    setErreurLocale(null);
    onSoumettre({
      montant: montantNombre,
      devise,
      methode,
      periodeCouverteJusquau: new Date(periodeCouverteJusquau).toISOString(),
      note: note.trim() || undefined,
    });
  }

  return (
    <div className="fond-modale" onClick={onFermer}>
      <form className="carte carte--etroite" onClick={(e) => e.stopPropagation()} onSubmit={soumettre}>
        <h2 className="titre">Enregistrer un paiement</h2>
        <p className="sous-titre">{hotel.nom}</p>

        <label className="label" htmlFor="montant">
          Montant
        </label>
        <input id="montant" className="champ" type="number" min="0" step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} />

        <label className="label" htmlFor="devise">
          Devise
        </label>
        <select id="devise" className="champ" value={devise} onChange={(e) => setDevise(e.target.value as Devise)}>
          <option value={Devise.USD}>USD</option>
          <option value={Devise.CDF}>CDF</option>
        </select>

        <label className="label" htmlFor="methode">
          Méthode
        </label>
        <select id="methode" className="champ" value={methode} onChange={(e) => setMethode(e.target.value as MethodePaiementLicence)}>
          <option value={MethodePaiementLicence.VIREMENT}>Virement</option>
          <option value={MethodePaiementLicence.MOBILE_MONEY}>Mobile Money</option>
          <option value={MethodePaiementLicence.ESPECES}>Espèces</option>
          <option value={MethodePaiementLicence.AUTRE}>Autre</option>
        </select>

        <label className="label" htmlFor="periode">
          Ce paiement couvre jusqu'au
        </label>
        <input
          id="periode"
          className="champ"
          type="date"
          value={periodeCouverteJusquau}
          onChange={(e) => setPeriodeCouverteJusquau(e.target.value)}
        />

        <label className="label" htmlFor="note">
          Note (optionnelle)
        </label>
        <input id="note" className="champ" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Référence, précisions…" />

        {(erreurLocale ?? erreur) && (
          <p className="erreur" role="alert">
            {erreurLocale ?? erreur}
          </p>
        )}

        <Button type="submit" disabled={enCours} style={{ width: "100%", marginTop: 16 }}>
          {enCours ? "Enregistrement…" : "Enregistrer le paiement"}
        </Button>
        <button type="button" className="lien-retour" onClick={onFermer} style={{ width: "100%", marginTop: 8, background: "none", border: "none", color: "var(--hc-ink-muted)", cursor: "pointer" }}>
          Annuler
        </button>
      </form>
    </div>
  );
}
