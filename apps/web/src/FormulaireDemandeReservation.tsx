import * as React from "react";
import { useId, useState } from "react";
import { Captcha, captchaActif } from "./Captcha";
import { useNavigate } from "react-router-dom";
import { Button, useDialogue } from "@hotel-chicago/ui";
import { creerDemandeReservationPublique } from "@hotel-chicago/api-client";
import type { Chambre } from "@hotel-chicago/types";
import { configuration } from "./config";
import { cheminHotel } from "./resoudreSousDomaine";

export interface FormulaireDemandeReservationProps {
  sousDomaine: string;
  chambre: Chambre;
  dateArrivee: string;
  dateDepart: string;
  onFermer: () => void;
}

/** « 2026-10-12 » → « 12/10/2026 » (par découpage du texte : aucun fuseau horaire en jeu). */
function dateJJMMAAAA(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * Toujours EN_ATTENTE côté API (voir PublicService.creerDemandeReservation) —
 * jamais de faux message de confirmation ici : la réception arbitre. Après
 * l'envoi, le client arrive sur sa page « Ma réservation » (statut en
 * attente, pré-enregistrement), dont il garde le lien.
 */
export function FormulaireDemandeReservation({
  sousDomaine,
  chambre,
  dateArrivee,
  dateDepart,
  onFermer,
}: FormulaireDemandeReservationProps) {
  const [jetonCaptcha, setJetonCaptcha] = useState<string | undefined>(undefined);
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const naviguer = useNavigate();
  const idTitre = useId();
  const refDialogue = useDialogue<HTMLDivElement>({ onEchap: onFermer });
  // Une saisie perdue par un clic malheureux sur le fond serait pénible sur téléphone : le fond ne ferme que si rien n'est saisi.
  const saisieModifiee = nom.trim() !== "" || telephone.trim() !== "" || email.trim() !== "";

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return setErreur("Votre nom est obligatoire.");

    setErreur(null);
    setEnCours(true);
    try {
      const { jetonSuivi } = await creerDemandeReservationPublique(
        { url: configuration.apiUrl },
        {
          sousDomaine,
          chambreId: chambre.id,
          client: { nom: nom.trim(), telephone: telephone.trim() || undefined, email: email.trim() || undefined },
          dateArrivee,
          dateDepart,
          captchaToken: jetonCaptcha,
        }
      );
      naviguer(cheminHotel(`/ma-reservation/${jetonSuivi}`));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur lors de l'envoi de la demande.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fond-modale" onMouseDown={(e) => e.target === e.currentTarget && !saisieModifiee && onFermer()}>
      <div ref={refDialogue} className="carte carte--etroite" role="dialog" aria-modal="true" aria-labelledby={idTitre}>
          <form onSubmit={soumettre}>
            <h2 id={idTitre} className="titre">
              Demande pour la chambre {chambre.numero}
            </h2>
            <p className="sous-titre">
              Du {dateJJMMAAAA(dateArrivee)} au {dateJJMMAAAA(dateDepart)}
            </p>

            <label className="label" htmlFor="nom-client">
              Votre nom
            </label>
            <input id="nom-client" className="champ" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" />

            <label className="label" htmlFor="telephone-client">
              Téléphone (recommandé)
            </label>
            <input id="telephone-client" className="champ" type="tel" autoComplete="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />

            <label className="label" htmlFor="email-client">
              Email (optionnel)
            </label>
            <input
              id="email-client"
              className="champ"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {erreur && (
              <p className="erreur" role="alert">
                {erreur}
              </p>
            )}

            <Captcha onJeton={setJetonCaptcha} />
            <Button type="submit" disabled={enCours || (captchaActif && !jetonCaptcha)} style={{ width: "100%", marginTop: 16 }}>
              {enCours ? "Envoi…" : "Envoyer la demande"}
            </Button>
            <button type="button" className="lien-retour" onClick={onFermer}>
              Annuler
            </button>
          </form>
      </div>
    </div>
  );
}
