import * as React from "react";
import { useState } from "react";
import { Button, ChampTelephone, telephoneDepuisSaisie } from "@hotel-chicago/ui";

export interface EcranConnexionProps {
  erreur: string | null;
  enCours: boolean;
  /** `identifiant` : numéro normalisé « +243XXXXXXXXX », ou e-mail (ancien compte). */
  onConnexion: (identifiant: string, motDePasse: string) => void;
}

/** Connexion par numéro de téléphone (15/10/2026), comme tous les comptes ;
 * un ancien compte super-admin sans numéro passe encore par son e-mail. */
export function EcranConnexion({ erreur, enCours, onConnexion }: EcranConnexionProps) {
  const [parEmail, setParEmail] = useState(false);
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreurLocale, setErreurLocale] = useState<string | null>(null);

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    const identifiant = parEmail ? email.trim() : telephoneDepuisSaisie(telephone);
    if (!identifiant) return setErreurLocale("Numéro invalide : 9 chiffres commençant par 8 ou 9 (ex. 970 000 000).");
    setErreurLocale(null);
    onConnexion(identifiant, motDePasse);
  }

  return (
    <div className="page-centree">
      <form className="carte carte--etroite" onSubmit={soumettre}>
        <img className="logo-carte" src="/logo-hotelsaver.png" alt="HotelSaver" />
        <h1 className="titre">HotelSaver</h1>
        <p className="sous-titre">Panel Super-Admin</p>

        {parEmail ? (
          <>
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
          </>
        ) : (
          <>
            <label className="label" htmlFor="telephone">
              Numéro de téléphone
            </label>
            <ChampTelephone id="telephone" value={telephone} onChange={setTelephone} required />
          </>
        )}

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

        {(erreurLocale ?? erreur) && (
          <p className="erreur" role="alert">
            {erreurLocale ?? erreur}
          </p>
        )}

        <Button type="submit" disabled={enCours} style={{ marginTop: 16, width: "100%" }}>
          {enCours ? "Connexion…" : "Se connecter"}
        </Button>
        <button type="button" className="lien-discret" onClick={() => setParEmail((v) => !v)}>
          {parEmail ? "Se connecter avec un numéro de téléphone" : "Ancien compte ? Se connecter avec un e-mail"}
        </button>
      </form>
    </div>
  );
}
