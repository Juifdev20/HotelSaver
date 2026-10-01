import * as React from "react";
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, MailCheck } from "lucide-react";
// Logo de l'APPLICATION HotelSaver — distinct du logo de l'hôtel
// (HotelBranding.logoUrl), voir DECISIONS.md « branding application vs hôtel ».
import { MiseEnPageAuth } from "../components/MiseEnPageAuth";
import logo from "../../../../../../assets/icons/hotelsaver-icone.png";

export interface EcranConnexionProps {
  onConnexion: (email: string, motDePasse: string) => void;
  /** Envoie l'e-mail « mot de passe oublié » ; rejette avec un message lisible en cas d'échec. */
  onMotDePasseOublie: (email: string) => Promise<void>;
  /** Ouvre le formulaire d'inscription, dans l'application (jamais sur le site web). */
  onCreerCompte: () => void;
  /** E-mail à pré-remplir (ex. venu d'un lien « Ouvrir l'application » du site). */
  emailInitial?: string;
  /** Message d'information affiché au-dessus du formulaire (ex. « Compte créé ! »). */
  message?: string | null;
  erreur: string | null;
  enCours: boolean;
}

/** Fond pleine page comme la maquette : photo à gauche qui se fond dans la page,
 * carte au centre. L'inscription d'un hôtel se fait sur le site web (lien
 * ci-dessous) ; la réinitialisation du mot de passe passe par un e-mail Supabase
 * dont le lien ouvre une page du site. */
export function EcranConnexion({
  onConnexion,
  onMotDePasseOublie,
  onCreerCompte,
  emailInitial,
  message,
  erreur,
  enCours,
}: EcranConnexionProps) {
  const [mode, setMode] = useState<"connexion" | "oubli">("connexion");
  const [email, setEmail] = useState(emailInitial ?? "");
  const [motDePasse, setMotDePasse] = useState("");
  const [visible, setVisible] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreurOubli, setErreurOubli] = useState<string | null>(null);

  async function envoyerLien(evenement: React.FormEvent) {
    evenement.preventDefault();
    setErreurOubli(null);
    setEnvoiEnCours(true);
    try {
      await onMotDePasseOublie(email.trim());
      setEnvoye(true);
    } catch (e) {
      setErreurOubli(e instanceof Error ? e.message : "Envoi impossible. Réessayez.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  function retourConnexion() {
    setMode("connexion");
    setEnvoye(false);
    setErreurOubli(null);
  }

  return (
    <MiseEnPageAuth>
      <div className="hc-auth__conteneur">
        <div className="hc-auth__carte">
          <img className="hc-auth__logo" src={logo} alt="" />
          <h1 className="hc-auth__marque">HotelSaver</h1>

          {mode === "connexion" && (
            <>
              <h2 className="hc-auth__titre">Bon retour 👋</h2>
              <p className="hc-auth__sous-titre">Connectez-vous à votre espace hôtelier.</p>

              {message && (
                <p className="hc-auth__info" role="status">
                  {message}
                </p>
              )}

              <form
                onSubmit={(evenement) => {
                  evenement.preventDefault();
                  onConnexion(email, motDePasse);
                }}
              >
                <label className="hc-auth__label" htmlFor="champ-email">
                  Email
                </label>
                <div className="hc-auth__boite">
                  <Mail size={18} aria-hidden="true" />
                  <input
                    id="champ-email"
                    type="email"
                    autoComplete="username"
                    placeholder="ex. hotel@monetablissement.com"
                    value={email}
                    onChange={(evenement) => setEmail(evenement.target.value)}
                    required
                  />
                </div>

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

                {erreur && (
                  <p className="hc-auth__erreur" role="alert" data-testid="erreur-connexion">
                    {erreur}
                  </p>
                )}

                <button type="submit" className="hc-auth__bouton" disabled={enCours}>
                  {enCours ? "Connexion…" : "Se connecter"}
                </button>
              </form>

              <div className="hc-auth__separateur">
                <span>Ou</span>
              </div>
              <p className="hc-auth__pas-de-compte">
                Vous n'avez pas encore de compte ?{" "}
                <button type="button" onClick={onCreerCompte}>
                  Créer un compte
                </button>
              </p>
            </>
          )}

          {mode === "oubli" && !envoye && (
            <>
              <h2 className="hc-auth__titre">Mot de passe oublié ?</h2>
              <p className="hc-auth__sous-titre">
                Saisissez l'adresse e-mail de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.
              </p>
              <form onSubmit={envoyerLien}>
                <label className="hc-auth__label" htmlFor="champ-email-oubli">
                  Email
                </label>
                <div className="hc-auth__boite">
                  <Mail size={18} aria-hidden="true" />
                  <input
                    id="champ-email-oubli"
                    type="email"
                    autoComplete="username"
                    placeholder="ex. hotel@monetablissement.com"
                    value={email}
                    onChange={(evenement) => setEmail(evenement.target.value)}
                    required
                    autoFocus
                  />
                </div>
                {erreurOubli && (
                  <p className="hc-auth__erreur" role="alert">
                    {erreurOubli}
                  </p>
                )}
                <button type="submit" className="hc-auth__bouton" disabled={envoiEnCours}>
                  {envoiEnCours ? "Envoi…" : "Envoyer le lien"}
                </button>
              </form>
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
              <h2 className="hc-auth__titre hc-auth__titre--centre">Consultez votre boîte mail</h2>
              <p className="hc-auth__sous-titre">
                Si un compte existe pour <strong>{email}</strong>, un e-mail vient d'être envoyé avec le lien de
                réinitialisation. Pensez à vérifier les courriers indésirables.
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
