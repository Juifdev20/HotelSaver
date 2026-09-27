import * as React from "react";
import { useState } from "react";
import { Button } from "@hotel-chicago/ui";
import type { HotelAvecValidite } from "@hotel-chicago/types";

export interface FormulaireDomaineProps {
  hotel: HotelAvecValidite;
  enCours: boolean;
  erreur: string | null;
  onAjouter: (domaine: string) => void;
  onVerifier: () => void;
  onRetirer: () => void;
  onFermer: () => void;
}

/**
 * Onboarding manuel du domaine personnalisé (Phase 13, décision du patron :
 * jamais en libre-service — voir DECISIONS.md). Pas d'instructions DNS
 * précises affichées ici : Render ne les expose pas via son API publique
 * (voir RenderDomainsService), seulement via son dashboard — le Super-Admin
 * s'y réfère directement une fois le domaine ajouté.
 */
export function FormulaireDomaine({ hotel, enCours, erreur, onAjouter, onVerifier, onRetirer, onFermer }: FormulaireDomaineProps) {
  const [domaine, setDomaine] = useState("");
  const [erreurLocale, setErreurLocale] = useState<string | null>(null);

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!domaine.trim()) return setErreurLocale("Le domaine est obligatoire.");
    setErreurLocale(null);
    onAjouter(domaine.trim());
  }

  return (
    <div className="fond-modale" onClick={onFermer}>
      <form className="carte carte--etroite" onClick={(e) => e.stopPropagation()} onSubmit={soumettre}>
        <h2 className="titre">Domaine personnalisé</h2>
        <p className="sous-titre">{hotel.nom}</p>

        {hotel.domainePersonnalise ? (
          <>
            <p className="label">Domaine actuel</p>
            <p>
              {hotel.domainePersonnalise}{" "}
              {hotel.domaineVerifie ? (
                <span style={{ color: "var(--hc-success)" }}>— vérifié</span>
              ) : (
                <span style={{ color: "var(--hc-warning)" }}>— en attente de vérification DNS</span>
              )}
            </p>

            {(erreurLocale ?? erreur) && (
              <p className="erreur" role="alert">
                {erreurLocale ?? erreur}
              </p>
            )}

            <Button type="button" variant="secondary" disabled={enCours} onClick={onVerifier} style={{ width: "100%", marginTop: 16 }}>
              {enCours ? "Vérification…" : "Vérifier maintenant"}
            </Button>
            <Button type="button" variant="secondary" disabled={enCours} onClick={onRetirer} style={{ width: "100%", marginTop: 8 }}>
              Retirer ce domaine
            </Button>
          </>
        ) : (
          <>
            <label className="label" htmlFor="domaine">
              Nom de domaine (ex. www.hotel-chicago.com)
            </label>
            <input id="domaine" className="champ" value={domaine} onChange={(e) => setDomaine(e.target.value)} />

            {(erreurLocale ?? erreur) && (
              <p className="erreur" role="alert">
                {erreurLocale ?? erreur}
              </p>
            )}

            <Button type="submit" disabled={enCours} style={{ width: "100%", marginTop: 16 }}>
              {enCours ? "Ajout…" : "Ajouter le domaine"}
            </Button>
          </>
        )}

        <button
          type="button"
          className="lien-retour"
          onClick={onFermer}
          style={{ width: "100%", marginTop: 8, background: "none", border: "none", color: "var(--hc-ink-muted)", cursor: "pointer" }}
        >
          Fermer
        </button>
      </form>
    </div>
  );
}
