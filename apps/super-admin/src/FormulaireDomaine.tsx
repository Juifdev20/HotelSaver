import * as React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { Button, useDialogue } from "@hotel-chicago/ui";
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
  // Retirer un domaine coupe l'accès au site de l'hôtel par cette adresse : on demande confirmation DANS la même fenêtre.
  const [confirmerRetrait, setConfirmerRetrait] = useState(false);
  const idTitre = useId();
  const refAnnulerRetrait = useRef<HTMLButtonElement>(null);
  const saisieModifiee = domaine.trim() !== "";

  const refDialogue = useDialogue<HTMLFormElement>({
    onEchap: () => (confirmerRetrait ? setConfirmerRetrait(false) : onFermer()),
  });

  useEffect(() => {
    if (confirmerRetrait) refAnnulerRetrait.current?.focus();
  }, [confirmerRetrait]);

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!domaine.trim()) return setErreurLocale("Le domaine est obligatoire.");
    setErreurLocale(null);
    onAjouter(domaine.trim());
  }

  return (
    // Pas de fermeture au clic sur le fond si un domaine a été saisi (une saisie perdue ne se récupère pas).
    <div className="fond-modale" onMouseDown={(e) => e.target === e.currentTarget && !saisieModifiee && !confirmerRetrait && onFermer()}>
      <form
        ref={refDialogue}
        className="carte carte--etroite"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        onSubmit={soumettre}
      >
        <h2 id={idTitre} className="titre">
          Domaine personnalisé
        </h2>
        <p className="sous-titre">{hotel.nom}</p>

        {hotel.domainePersonnalise && confirmerRetrait ? (
          <>
            <p role="alert">
              Retirer le domaine <strong>{hotel.domainePersonnalise}</strong> de l'hôtel « {hotel.nom} » ? Le site de l'hôtel ne sera plus accessible par cette adresse.
            </p>
            {(erreurLocale ?? erreur) && (
              <p className="erreur" role="alert">
                {erreurLocale ?? erreur}
              </p>
            )}
            <Button
              type="button"
              variant="secondary"
              ref={refAnnulerRetrait}
              disabled={enCours}
              onClick={() => setConfirmerRetrait(false)}
              style={{ width: "100%", marginTop: 16 }}
            >
              Annuler
            </Button>
            <Button type="button" variant="danger" disabled={enCours} onClick={onRetirer} style={{ width: "100%", marginTop: 8 }}>
              {enCours ? "Retrait…" : `Retirer le domaine ${hotel.domainePersonnalise}`}
            </Button>
          </>
        ) : hotel.domainePersonnalise ? (
          <>
            <p className="label">Domaine actuel</p>
            <p>
              {hotel.domainePersonnalise}{" "}
              {hotel.domaineVerifie ? (
                <span className="texte-succes">— vérifié</span>
              ) : (
                <span className="texte-alerte">— en attente de vérification DNS</span>
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
            <Button type="button" variant="secondary" disabled={enCours} onClick={() => setConfirmerRetrait(true)} style={{ width: "100%", marginTop: 8 }}>
              Retirer ce domaine…
            </Button>
          </>
        ) : (
          <>
            <label className="label" htmlFor="domaine">
              Nom de domaine (ex. www.hotel-chicago.com)
            </label>
            <input id="domaine" className="champ" value={domaine} onChange={(e) => setDomaine(e.target.value)} autoComplete="off" />

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
        >
          Fermer
        </button>
      </form>
    </div>
  );
}
