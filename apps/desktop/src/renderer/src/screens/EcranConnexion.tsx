import * as React from "react";
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, MailCheck } from "lucide-react";
import { ChampTelephone, saisieDepuisTelephone, telephoneDepuisSaisie, useTitrePage } from "@hotel-chicago/ui";
// Logo de l'APPLICATION HotelSaver — distinct du logo de l'hôtel
// (HotelBranding.logoUrl), voir DECISIONS.md « branding application vs hôtel ».
import { MiseEnPageAuth } from "../components/MiseEnPageAuth";
import logo from "../../../../../../assets/icons/hotelsaver-icone.png";

export interface EcranConnexionProps {
  /** `identifiant` : numéro normalisé « +243XXXXXXXXX », ou e-mail (ancien compte). */
  onConnexion: (identifiant: string, motDePasse: string) => void;
  /** « Mot de passe oublié » ; rejette avec un message lisible en cas d'échec. */
  onMotDePasseOublie: (identifiant: string) => Promise<void>;
  /** Ouvre le formulaire d'inscription, dans l'application (jamais sur le site web). */
  onCreerCompte: () => void;
  /** Numéro ou e-mail à pré-remplir (ex. venu d'un lien « Ouvrir l'application » du site). */
  identifiantInitial?: string;
  /** Message d'information affiché au-dessus du formulaire (ex. « Compte créé ! »). */
  message?: string | null;
  erreur: string | null;
  enCours: boolean;
}

/** Fond pleine page comme la maquette : photo à gauche qui se fond dans la page,
 * carte au centre. Connexion par **numéro de téléphone** depuis le 15/10/2026
 * (tous les rôles) ; un ancien compte sans numéro peut encore passer par son
 * e-mail (« Ancien compte ? … ») tant qu'on ne lui a pas ajouté de numéro. */
export function EcranConnexion({
  onConnexion,
  onMotDePasseOublie,
  onCreerCompte,
  identifiantInitial,
  message,
  erreur,
  enCours,
}: EcranConnexionProps) {
  const [mode, setMode] = useState<"connexion" | "oubli">("connexion");
  useTitrePage(mode === "oubli" ? "Mot de passe oublié" : "Connexion");
  const [parEmail, setParEmail] = useState(!!identifiantInitial?.includes("@"));
  const [telephone, setTelephone] = useState(identifiantInitial?.includes("@") ? "" : saisieDepuisTelephone(identifiantInitial));
  const [email, setEmail] = useState(identifiantInitial?.includes("@") ? identifiantInitial : "");
  const [motDePasse, setMotDePasse] = useState("");
  const [visible, setVisible] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreurLocale, setErreurLocale] = useState<string | null>(null);

  /** Identifiant saisi (numéro normalisé ou e-mail), ou null avec un message. */
  function identifiant(): string | null {
    if (parEmail) return email.trim();
    const numero = telephoneDepuisSaisie(telephone);
    if (!numero) setErreurLocale("Numéro invalide : 9 chiffres commençant par 8 ou 9 (ex. 970 000 000).");
    return numero;
  }

  async function envoyerLien(evenement: React.FormEvent) {
    evenement.preventDefault();
    setErreurLocale(null);
    const id = identifiant();
    if (!id) return;
    setEnvoiEnCours(true);
    try {
      await onMotDePasseOublie(id);
      setEnvoye(true);
    } catch (e) {
      setErreurLocale(e instanceof Error ? e.message : "Envoi impossible. Réessayez.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  function retourConnexion() {
    setMode("connexion");
    setEnvoye(false);
    setErreurLocale(null);
  }

  const champIdentifiant = parEmail ? (
    <>
      <label className="hc-auth__label" htmlFor="champ-email">
        Adresse e-mail
      </label>
      <div className="hc-auth__boite">
        <Mail size={18} aria-hidden="true" />
        <input
          id="champ-email"
          type="email"
          autoComplete="username"
          placeholder="nom@hotel.com"
          value={email}
          onChange={(evenement) => setEmail(evenement.target.value)}
          required
        />
      </div>
    </>
  ) : (
    <>
      <label className="hc-auth__label" htmlFor="champ-telephone">
        Numéro de téléphone
      </label>
      <ChampTelephone id="champ-telephone" value={telephone} onChange={setTelephone} required />
    </>
  );

  const basculeEmail = (
    <p className="hc-auth__pas-de-compte">
      <button
        type="button"
        onClick={() => {
          setParEmail((v) => !v);
          setErreurLocale(null);
        }}
      >
        {parEmail ? "Se connecter avec un numéro de téléphone" : "Ancien compte ? Se connecter avec un e-mail"}
      </button>
    </p>
  );

  const erreurAffichee = erreurLocale ?? erreur;

  return (
    <MiseEnPageAuth>
      <div className="hc-auth__conteneur">
        <div className="hc-auth__carte">
          <img className="hc-auth__logo" src={logo} alt="" />
          <h1 className="hc-auth__marque">HotelSaver</h1>

          {mode === "connexion" && (
            <>
              <h2 className="hc-auth__titre">Ravi de vous revoir !</h2>
              <p className="hc-auth__sous-titre">Connectez-vous à votre espace hôtelier.</p>

              {message && (
                <p className="hc-auth__info" role="status">
                  {message}
                </p>
              )}

              <form
                onSubmit={(evenement) => {
                  evenement.preventDefault();
                  setErreurLocale(null);
                  const id = identifiant();
                  if (id) onConnexion(id, motDePasse);
                }}
              >
                {champIdentifiant}

                <label className="hc-auth__label" htmlFor="champ-mot-de-passe">
                  Mot de passe
                </label>
                <div className="hc-auth__boite">
                  <Lock size={18} aria-hidden="true" />
                  <input
                    id="champ-mot-de-passe"
                    type={visible ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Votre mot de passe"
                    value={motDePasse}
                    onChange={(evenement) => setMotDePasse(evenement.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="hc-auth__oeil"
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? "Masquer la saisie" : "Afficher la saisie"}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <div className="hc-auth__oubli">
                  <button type="button" onClick={() => setMode("oubli")}>
                    Mot de passe oublié ?
                  </button>
                </div>

                {erreurAffichee && (
                  <p className="hc-auth__erreur" role="alert" data-testid="erreur-connexion">
                    {erreurAffichee}
                  </p>
                )}

                <button type="submit" className="hc-auth__bouton" disabled={enCours}>
                  {enCours ? "Connexion…" : "Se connecter"}
                </button>
              </form>

              <div className="hc-auth__separateur">
                <span>ou</span>
              </div>
              <p className="hc-auth__pas-de-compte">
                Vous débutez avec HotelSaver ?{" "}
                <button type="button" onClick={onCreerCompte}>
                  Créez votre hôtel
                </button>
              </p>
              {basculeEmail}
            </>
          )}

          {mode === "oubli" && !envoye && (
            <>
              <h2 className="hc-auth__titre">Mot de passe oublié ?</h2>
              <p className="hc-auth__sous-titre">Saisissez le numéro de votre compte.</p>
              <form onSubmit={envoyerLien}>
                {champIdentifiant}
                {erreurAffichee && (
                  <p className="hc-auth__erreur" role="alert">
                    {erreurAffichee}
                  </p>
                )}
                <button type="submit" className="hc-auth__bouton" disabled={envoiEnCours}>
                  {envoiEnCours ? "Envoi…" : "Continuer"}
                </button>
              </form>
              {basculeEmail}
              <button type="button" className="hc-auth__retour" onClick={retourConnexion}>
                <ArrowLeft size={14} aria-hidden="true" /> Retour à la connexion
              </button>
            </>
          )}

          {mode === "oubli" && envoye && (
            <>
              <div className="hc-auth__succes-icone">
                <MailCheck size={30} aria-hidden="true" />
              </div>
              <h2 className="hc-auth__titre hc-auth__titre--centre">Demande envoyée</h2>
              <p className="hc-auth__sous-titre">
                Si une adresse e-mail est associée à ce compte, un lien pour choisir un nouveau mot de passe vient d'y être
                envoyé (pensez aux courriers indésirables).
              </p>
              <p className="hc-auth__info">
                Pas d'e-mail sur votre compte ? Employé : demandez à votre patron de changer votre mot de passe. Patron :
                contactez le support HotelSaver.
              </p>
              <button type="button" className="hc-auth__bouton" onClick={retourConnexion}>
                Retour à la connexion
              </button>
            </>
          )}
        </div>
      </div>
    </MiseEnPageAuth>
  );
}
