import * as React from "react";
import { useState } from "react";
import { Button } from "@hotel-chicago/ui";

export interface EcranConnexionProps {
  erreur: string | null;
  enCours: boolean;
  onConnexion: (email: string, motDePasse: string) => void;
}

export function EcranConnexion({ erreur, enCours, onConnexion }: EcranConnexionProps) {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    onConnexion(email.trim(), motDePasse);
  }

  return (
    <div className="page-centree">
      <form className="carte carte--etroite" onSubmit={soumettre}>
        <img className="logo-carte" src="/logo-hotelsaver.png" alt="HotelSaver" />
        <h1 className="titre">HotelSaver</h1>
        <p className="sous-titre">Panel Super-Admin</p>

        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="champ"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="label" htmlFor="mot-de-passe">
          Mot de passe
        </label>
        <input
          id="mot-de-passe"
          className="champ"
          type="password"
          autoComplete="current-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
        />

        {erreur && (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        )}

        <Button type="submit" disabled={enCours} style={{ marginTop: 16, width: "100%" }}>
          {enCours ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
    </div>
  );
}
