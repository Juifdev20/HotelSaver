import * as React from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CircleAlert, Download, Lock, LogOut, Mail, ShieldCheck } from "lucide-react";
import { ClientApi, ErreurApi, connecterViaApi } from "@hotel-chicago/api-client";
import { formaterSaisieRdc, type GuideDisponible } from "@hotel-chicago/types";
import { ChampTelephone, telephoneDepuisSaisie } from "@hotel-chicago/ui";
import { configuration } from "../config";
import { ChampAuth } from "../auth/ChampAuth";
import { PiedPage } from "../accueil/PiedPage";
import "../paiement/suivi.css";
import "../payer/payer.css";
import "./guide.css";

/**
 * « Guide d'utilisation » sur le site (20/10/2026) : réservé aux comptes connectés. Le jeton reste EN MÉMOIRE (fermer l'onglet
 * déconnecte, rien n'est écrit sur l'appareil, comme la page de paiement). Le serveur ne donne que les guides du rôle du compte, et
 * chaque ouverture demande un lien signé de 5 minutes : aucun lien permanent vers le PDF n'existe.
 */

interface Session {
  client: ClientApi;
  nom: string;
  hotelNom: string;
}

function message(e: unknown, defaut: string): string {
  if (e instanceof ErreurApi && e.statusCode === 0) return "Impossible de joindre le serveur. Vérifiez votre connexion internet puis réessayez.";
  return e instanceof Error ? e.message : defaut;
}

const mo = (octets: number) => `${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;

export function EcranGuide() {
  const [session, setSession] = useState<Session | null>(null);
  return (
    <div className="pay">
      <div className="pay__fond" aria-hidden="true" />
      <main className="pay__contenu">{session ? <Guides session={session} onDeconnexion={() => setSession(null)} /> : <Connexion onConnecte={setSession} />}</main>
      <PiedPage />
    </div>
  );
}

function Connexion({ onConnecte }: { onConnecte: (s: Session) => void }) {
  const [parEmail, setParEmail] = useState(false);
  const [telephone, setTelephone] = useState(() => formaterSaisieRdc(""));
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    let identifiant: string;
    if (parEmail) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErreur("Saisissez une adresse e-mail valide.");
      identifiant = email.trim();
    } else {
      const numero = telephoneDepuisSaisie(telephone);
      if (!numero) return setErreur("Numéro invalide : 9 chiffres commençant par 8 ou 9 (ex. 970 000 000).");
      identifiant = numero;
    }
    if (!motDePasse) return setErreur("Saisissez votre mot de passe.");
    setErreur(null);
    setEnCours(true);
    try {
      const jeton = await connecterViaApi([configuration.apiUrl], identifiant, motDePasse);
      const client = new ClientApi(configuration.apiUrl, () => jeton.accessToken);
      const profil = await client.moi();
      onConnecte({ client, nom: profil.nom, hotelNom: profil.hotelNom });
    } catch (err) {
      setErreur(message(err, "Connexion impossible. Réessayez."));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="pay-intro">
      <div className="pay-intro__texte">
        <span className="pay-pastille">
          <ShieldCheck size={15} aria-hidden="true" /> Réservé aux clients HotelSaver
        </span>
        <h1 className="pay-intro__titre">
          Guide d'utilisation <span>pas à pas</span>
        </h1>
        <p className="pay-intro__sous-titre">
          Connectez-vous avec le numéro et le mot de passe de votre compte HotelSaver. Le patron trouve tous les guides ; la réception et la
          cafétaria, le guide de leur poste.
        </p>
      </div>

      <div className="pay-carte pay-connexion">
        <div className="pay-connexion__tete">
          <img src="/logo-hotelsaver.png" alt="" width="48" height="48" />
          <div>
            <h2>Connexion</h2>
            <p>Pour ouvrir votre guide.</p>
          </div>
        </div>
        <form onSubmit={envoyer} noValidate className="pay-connexion__form">
          {parEmail ? (
            <ChampAuth id="guide-email" libelle="Adresse e-mail" icone={Mail} type="email" autoComplete="email" valeur={email} onChange={setEmail} />
          ) : (
            <div className="champ-auth">
              <label htmlFor="guide-telephone">Numéro de téléphone</label>
              <ChampTelephone id="guide-telephone" value={telephone} onChange={setTelephone} required />
            </div>
          )}
          <button type="button" className="pay-lien pay-lien--discret" onClick={() => setParEmail((v) => !v)}>
            {parEmail ? "Utiliser mon numéro de téléphone" : "Ancien compte ? Utiliser mon e-mail"}
          </button>
          <ChampAuth id="guide-mdp" libelle="Mot de passe" icone={Lock} type="password" autoComplete="current-password" valeur={motDePasse} onChange={setMotDePasse} />
          {erreur && (
            <p className="pay-erreur" role="alert">
              <CircleAlert size={17} aria-hidden="true" /> {erreur}
            </p>
          )}
          <button type="submit" className="acompte-bouton-payer pay-bouton-plein" disabled={enCours}>
            {enCours ? <span className="acompte-spinner acompte-spinner--petit pay-spinner-blanc" aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}
            {enCours ? "Connexion…" : "Continuer"}
          </button>
        </form>
        <div className="pay-connexion__liens">
          <Link to="/mot-de-passe-oublie" className="pay-lien">
            Mot de passe oublié ?
          </Link>
        </div>
      </div>
    </div>
  );
}

function Guides({ session, onDeconnexion }: { session: Session; onDeconnexion: () => void }) {
  const [guides, setGuides] = useState<GuideDisponible[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverture, setOuverture] = useState<string | null>(null);

  async function charger() {
    setErreur(null);
    try {
      setGuides(await session.client.listerGuides());
    } catch (e) {
      setErreur(message(e, "Chargement impossible."));
    }
  }

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ouvrir(g: GuideDisponible) {
    setOuverture(g.guide);
    setErreur(null);
    try {
      const { url } = await session.client.lienGuide(g.guide);
      window.location.assign(url);
    } catch (e) {
      setErreur(message(e, "Ouverture impossible."));
    } finally {
      setOuverture(null);
    }
  }

  return (
    <div className="pay-page">
      <div className="pay-tete pay-tete--ok">
        <div className="pay-tete__haut">
          <span className="pay-tete__surtitre">Guide d'utilisation</span>
          <button type="button" className="pay-tete__deconnexion" onClick={onDeconnexion}>
            <LogOut size={15} aria-hidden="true" /> Se déconnecter
          </button>
        </div>
        <h1 className="pay-tete__titre">{session.hotelNom}</h1>
        <p className="pay-tete__session">Connecté : {session.nom}</p>
      </div>

      {erreur && (
        <p className="pay-erreur" role="alert">
          <CircleAlert size={17} aria-hidden="true" /> {erreur}{" "}
          <button type="button" className="pay-lien" onClick={() => void charger()}>
            Réessayer
          </button>
        </p>
      )}
      {!guides && !erreur && (
        <p className="visuellement-cache" role="status">
          Chargement des guides…
        </p>
      )}
      {guides && guides.length === 0 && <p className="guide-vide">Aucun guide n'est encore publié pour votre compte. Revenez bientôt.</p>}
      {guides && guides.length > 0 && (
        <ul className="guide-liste">
          {guides.map((g) => (
            <li key={g.guide} className="pay-carte guide-carte">
              <BookOpen size={28} aria-hidden="true" className="guide-carte__icone" />
              <div className="guide-carte__texte">
                <strong>{g.libelle}</strong>
                <span>
                  {g.edition ?? `Version ${g.version}`} · PDF, {mo(g.taille)}
                </span>
              </div>
              <button type="button" className="acompte-bouton-payer guide-carte__bouton" disabled={ouverture !== null} onClick={() => void ouvrir(g)}>
                <Download size={17} aria-hidden="true" /> {ouverture === g.guide ? "Ouverture…" : "Télécharger"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="guide-note">Le lien de téléchargement est personnel et expire au bout de 5 minutes : ne le partagez pas.</p>
    </div>
  );
}
