import * as React from "react";
import { useState } from "react";
import { Button } from "@hotel-chicago/ui";
import { creerDemandeReservationPublique } from "@hotel-chicago/api-client";
import type { Chambre } from "@hotel-chicago/types";
import { configuration } from "./config";

export interface FormulaireDemandeReservationProps {
  sousDomaine: string;
  chambre: Chambre;
  dateArrivee: string;
  dateDepart: string;
  onFermer: () => void;
}

/**
 * Toujours EN_ATTENTE côté API (voir PublicService.creerDemandeReservation) —
 * jamais de faux message de confirmation ici : la réception arbitre.
 */
export function FormulaireDemandeReservation({
  sousDomaine,
  chambre,
  dateArrivee,
  dateDepart,
  onFermer,
}: FormulaireDemandeReservationProps) {
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoyee, setEnvoyee] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return setErreur("Votre nom est obligatoire.");

    setErreur(null);
    setEnCours(true);
    try {
      await creerDemandeReservationPublique(
        { url: configuration.apiUrl },
        {
          sousDomaine,
          chambreId: chambre.id,
          client: { nom: nom.trim(), telephone: telephone.trim() || undefined, email: email.trim() || undefined },
          dateArrivee,
          dateDepart,
        }
      );
      setEnvoyee(true);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur lors de l'envoi de la demande.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fond-modale" onClick={onFermer}>
      <div className="carte carte--etroite" onClick={(e) => e.stopPropagation()}>
        {envoyee ? (
          <>
            <h2 className="titre">Demande envoyée !</h2>
            <p className="sous-titre">L'hôtel vous contactera pour confirmer votre réservation.</p>
            <Button style={{ width: "100%", marginTop: 16 }} onClick={onFermer}>
              Fermer
            </Button>
          </>
        ) : (
          <form onSubmit={soumettre}>
            <h2 className="titre">Chambre {chambre.numero}</h2>
            <p className="sous-titre">
              Du {dateArrivee} au {dateDepart}
            </p>

            <label className="label" htmlFor="nom-client">
              Votre nom
            </label>
            <input id="nom-client" className="champ" value={nom} onChange={(e) => setNom(e.target.value)} />

            <label className="label" htmlFor="telephone-client">
              Téléphone (recommandé)
            </label>
            <input id="telephone-client" className="champ" value={telephone} onChange={(e) => setTelephone(e.target.value)} />

            <label className="label" htmlFor="email-client">
              Email (optionnel)
            </label>
            <input
              id="email-client"
              className="champ"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {erreur && (
              <p className="erreur" role="alert">
                {erreur}
              </p>
            )}

            <Button type="submit" disabled={enCours} style={{ width: "100%", marginTop: 16 }}>
              {enCours ? "Envoi…" : "Envoyer la demande"}
            </Button>
            <button type="button" className="lien-retour" onClick={onFermer}>
              Annuler
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
