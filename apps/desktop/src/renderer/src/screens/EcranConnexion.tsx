import * as React from "react";
import { useState } from "react";
import { Button } from "@hotel-chicago/ui";
// Logo de l'APPLICATION HotelSaver — distinct du logo de l'hôtel
// (HotelBranding.logoUrl), voir DECISIONS.md « branding application vs hôtel ».
import logo from "../../../../../../assets/icons/hotelsaver-icone.png";

export interface EcranConnexionProps {
  onConnexion: (email: string, motDePasse: string) => void;
  onOuvrirParametres: () => void;
  erreur: string | null;
  enCours: boolean;
}

export function EcranConnexion({ onConnexion, onOuvrirParametres, erreur, enCours }: EcranConnexionProps) {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");

  return (
    <div className="hc-page-centree">
      <div className="hc-ecran-connexion">
        <img className="hc-ecran-connexion__logo" src={logo} alt="" />
        <div className="hc-ecran-connexion__entete">
          <h1 className="hc-text-display-md">HotelSaver</h1>
          <p className="hc-text-caption texte-discret">Réception & gestion hôtelière</p>
        </div>

        <form
          onSubmit={(evenement) => {
            evenement.preventDefault();
            onConnexion(email, motDePasse);
          }}
        >
          <label className="hc-text-label" htmlFor="champ-email">
            Email
          </label>
          <input
            id="champ-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(evenement) => setEmail(evenement.target.value)}
            required
          />

          <label className="hc-text-label" htmlFor="champ-mot-de-passe">
            Mot de passe
          </label>
          <input
            id="champ-mot-de-passe"
            type="password"
            autoComplete="current-password"
            value={motDePasse}
            onChange={(evenement) => setMotDePasse(evenement.target.value)}
            required
          />

          {erreur && (
            <p className="hc-text-body texte-erreur" role="alert" data-testid="erreur-connexion">
              {erreur}
            </p>
          )}

          <Button type="submit" disabled={enCours}>
            {enCours ? "Connexion…" : "Se connecter"}
          </Button>
        </form>

        <Button type="button" variant="secondary" size="sm" onClick={onOuvrirParametres}>
          Paramètres
        </Button>
      </div>
    </div>
  );
}
