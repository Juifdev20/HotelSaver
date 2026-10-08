import * as React from "react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Lock, Mail, MailCheck, ShieldCheck } from "lucide-react";
import { demanderReinitialisationMotDePasse, reinitialiserMotDePasse } from "@hotel-chicago/api-client";
import { configuration } from "../config";
import { BoutonsStores } from "../accueil/Stores";
import { OuvrirApplication } from "../accueil/OuvrirApplication";
import { MiseEnPageAuth } from "./MiseEnPageAuth";
import { ChampAuth } from "./ChampAuth";

/** Page « Se connecter » du site : le site n'ouvre aucune session (le personnel
 * se connecte depuis l'application — DECISIONS.md, Phase 8). Cette page l'explique
 * et envoie vers l'installation, avec les mêmes liens que sur le reste du site. */
export function EcranConnexionWeb() {
  return (
    <MiseEnPageAuth>
      <div className="carte-auth">
        <img className="carte-auth__logo" src="/logo-hotelsaver.png" alt="" />
        <div className="carte-auth__marque">HotelSaver</div>
        <h1 className="carte-auth__titre">Bon retour</h1>
        <p className="carte-auth__sous-titre">
          Votre espace hôtelier se trouve dans l'application HotelSaver. Ouvrez-la et connectez-vous avec votre adresse
          e-mail et votre mot de passe.
        </p>

        <div className="telechargements">
          <OuvrirApplication />
        </div>

        <Link to="/mot-de-passe-oublie" className="lien-auth">
          <strong>Mot de passe oublié ?</strong>
        </Link>

        <div className="auth-separateur">
          <span>Ou</span>
        </div>
        <Link to="/inscription" className="lien-auth lien-auth--sans-marge">
          Vous n'avez pas encore de compte ? <strong>Créer un compte</strong>
        </Link>
      </div>
    </MiseEnPageAuth>
  );
}

/** Demande de lien de réinitialisation. Message identique que le compte existe ou non. */
export function EcranMotDePasseOublie() {
  const [email, setEmail] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErreur("Saisissez une adresse e-mail valide.");
    setErreur(null);
    setEnCours(true);
    try {
      await demanderReinitialisationMotDePasse({ url: configuration.apiUrl }, email.trim());
      setEnvoye(true);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Envoi impossible. Réessayez.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <MiseEnPageAuth>
      <div className="carte-auth">
        <img className="carte-auth__logo" src="/logo-hotelsaver.png" alt="" />
        <div className="carte-auth__marque">HotelSaver</div>

        {!envoye ? (
          <>
            <h1 className="carte-auth__titre">Mot de passe oublié ?</h1>
            <p className="carte-auth__sous-titre">
              Saisissez l'adresse e-mail de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.
            </p>
            <form onSubmit={envoyer} noValidate>
              <ChampAuth id="email-oubli" libelle="Adresse e-mail" icone={Mail} valeur={email} onChange={setEmail} type="email" placeholder="ex. hotel@monetablissement.com" autoComplete="username" />
              {erreur && (
                <p className="auth-erreur" role="alert">
                  {erreur}
                </p>
              )}
              <button type="submit" className="bouton-auth" disabled={enCours}>
                {enCours ? "Envoi…" : "Envoyer le lien"}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="auth-succes-icone">
              <MailCheck size={30} aria-hidden="true" />
            </div>
            <h1 className="carte-auth__titre">Consultez votre boîte mail</h1>
            <p className="carte-auth__sous-titre">
              Si un compte existe pour <strong>{email.trim()}</strong>, un e-mail vient d'être envoyé avec le lien de
              réinitialisation. Pensez à vérifier les courriers indésirables.
            </p>
          </>
        )}

        <Link to="/connexion" className="lien-auth">
          <ArrowLeft size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
          Retour à la connexion
        </Link>
      </div>
    </MiseEnPageAuth>
  );
}

/** Lecture du lien de l'e-mail de récupération : Supabase y place le jeton dans le
 * fragment (`#access_token=…&type=recovery`), ou une erreur (`#error_code=otp_expired`). */
function lireLien(): { jeton: string | null; erreur: string | null } {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const jeton = params.get("access_token");
  if (jeton) return { jeton, erreur: null };
  if (params.get("error") || params.get("error_code")) {
    return { jeton: null, erreur: "Ce lien a expiré ou a déjà été utilisé. Refaites une demande de réinitialisation." };
  }
  return { jeton: null, erreur: null };
}

export function EcranReinitialisation() {
  // Lu une seule fois puis retiré de la barre d'adresse : un jeton ne doit pas rester dans l'historique.
  const { hash } = useLocation();
  const [lien, setLien] = useState(lireLien);
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [termine, setTermine] = useState(false);
  const [erreur, setErreur] = useState<string | null>(lien.erreur);

  // Un nouveau lien ouvert dans le même onglet (le fragment change sans rechargement) est relu.
  useEffect(() => {
    // Le fragment est retiré de la barre d'adresse après lecture : ne rien relire s'il a déjà disparu
    // (le mode strict de React exécute cet effet deux fois en développement).
    if (!hash || !window.location.hash) return;
    const nouveau = lireLien();
    setLien(nouveau);
    setErreur(nouveau.erreur);
    setTermine(false);
    window.history.replaceState(null, "", window.location.pathname);
  }, [hash]);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!lien.jeton) return;
    if (motDePasse.length < 8) return setErreur("Le mot de passe doit contenir au moins 8 caractères.");
    if (motDePasse !== confirmation) return setErreur("Les deux mots de passe ne correspondent pas.");
    setErreur(null);
    setEnCours(true);
    try {
      await reinitialiserMotDePasse({ url: configuration.apiUrl }, lien.jeton, motDePasse);
      setTermine(true);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Modification impossible. Réessayez.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <MiseEnPageAuth>
      <div className="carte-auth">
        <img className="carte-auth__logo" src="/logo-hotelsaver.png" alt="" />
        <div className="carte-auth__marque">HotelSaver</div>

        {termine ? (
          <>
            <div className="auth-succes-icone">
              <ShieldCheck size={30} aria-hidden="true" />
            </div>
            <h1 className="carte-auth__titre">Mot de passe modifié</h1>
            <p className="carte-auth__sous-titre">Vous pouvez maintenant vous connecter depuis l'application avec votre nouveau mot de passe.</p>
            <div className="telechargements">
              <BoutonsStores />
            </div>
            <Link to="/connexion" className="lien-auth">
              <strong>Retour à la connexion</strong>
            </Link>
          </>
        ) : lien.jeton ? (
          <>
            <h1 className="carte-auth__titre">Nouveau mot de passe</h1>
            <p className="carte-auth__sous-titre">Choisissez un mot de passe d'au moins 8 caractères.</p>
            <form onSubmit={enregistrer} noValidate>
              <ChampAuth id="nouveau-mdp" libelle="Nouveau mot de passe" icone={Lock} valeur={motDePasse} onChange={setMotDePasse} type="password" placeholder="Minimum 8 caractères" autoComplete="new-password" />
              <ChampAuth id="confirmation-mdp" libelle="Confirmer le mot de passe" icone={Lock} valeur={confirmation} onChange={setConfirmation} type="password" autoComplete="new-password" />
              {erreur && (
                <p className="auth-erreur" role="alert">
                  {erreur}
                </p>
              )}
              <button type="submit" className="bouton-auth" disabled={enCours}>
                {enCours ? "Enregistrement…" : "Enregistrer le mot de passe"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="carte-auth__titre">Lien invalide</h1>
            <p className="carte-auth__sous-titre">{erreur ?? "Ouvrez le lien reçu par e-mail, ou refaites une demande de réinitialisation."}</p>
            <Link to="/mot-de-passe-oublie" className="bouton-auth bouton-auth--lien">
              Refaire une demande
            </Link>
          </>
        )}
      </div>
    </MiseEnPageAuth>
  );
}
