import * as React from "react";
import { useState } from "react";
import { Button } from "@hotel-chicago/ui";

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
    <div className="hc-ecran-connexion">
      <h1 className="hc-text-display-md">Hôtel Chicago</h1>
      <p className="hc-text-body">Quartier Congo ya Sika, Kasindi, Nord-Kivu, RDC</p>

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
          value={motDePasse}
          onChange={(evenement) => setMotDePasse(evenement.target.value)}
          required
        />

        {erreur && (
          <p className="hc-text-body" role="alert" data-testid="erreur-connexion" style={{ color: "var(--hc-danger)" }}>
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
  );
}
