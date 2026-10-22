import * as React from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CircleCheck, Lock, Mail, Trash2 } from "lucide-react";
import { ClientApi, ErreurApi, connecterViaApi } from "@hotel-chicago/api-client";
import { Role } from "@hotel-chicago/types";
import { ChampTelephone, telephoneDepuisSaisie } from "@hotel-chicago/ui";
import { configuration } from "../config";
import { ChampAuth } from "../auth/ChampAuth";
import { MiseEnPageAuth } from "../auth/MiseEnPageAuth";
import "./compte.css";

const RAISONS = [
  { valeur: "plus_utilise", libelle: "Je n'utilise plus HotelSaver" },
  { valeur: "trop_cher", libelle: "C'est trop cher" },
  { valeur: "probleme_technique", libelle: "L'application ne marche pas bien chez moi" },
  { valeur: "hotel_ferme", libelle: "L'hôtel a fermé ou changé de propriétaire" },
  { valeur: "autre_logiciel", libelle: "Je passe à un autre logiciel" },
  { valeur: "autre", libelle: "Autre raison" },
] as const;

interface Session {
  client: ClientApi;
  hotelNom: string;
  obstacles: string[];
}

const message = (e: unknown, defaut: string) => {
  if (e instanceof ErreurApi && e.statusCode === 0) return "Impossible de joindre le serveur. Vérifiez votre connexion internet puis réessayez.";
  return e instanceof Error ? e.message : defaut;
};

/**
 * « Supprimer mon compte », page publique /supprimer-mon-compte (22/10/2026 ; l'adresse donnée à Google Play, et le bouton de
 * l'application ouvre cette page). Seul le PATRON peut : son compte, son hôtel et tout ce qui lui appartient partent ensemble. La
 * réception et la cafétéria n'ont pas ce pouvoir : le patron les retire de son équipe. Étapes : connexion du patron, ce qui reste à
 * faire avant (clients présents, réservations, remboursements), puis la raison du départ et le nom de l'hôtel retapé. La session
 * reste en mémoire : fermer l'onglet déconnecte.
 */
export function EcranSuppressionCompte() {
  const [session, setSession] = useState<Session | null>(null);
  const [supprime, setSupprime] = useState(false);

  return (
    <MiseEnPageAuth>
      <div className="carte-auth">
        <img className="carte-auth__logo" src="/logo-hotelsaver.png" alt="" />
        <div className="carte-auth__marque">HotelSaver</div>
        <h1 className="carte-auth__titre">Supprimer mon compte</h1>

        {supprime ? (
          <>
            <div className="auth-succes-icone">
              <CircleCheck size={30} aria-hidden="true" />
            </div>
            <p className="carte-auth__sous-titre">
              Votre hôtel et tous ses comptes sont supprimés. Merci d'avoir utilisé HotelSaver. Vous pouvez désinstaller l'application.
            </p>
          </>
        ) : !session ? (
          <Connexion onConnecte={setSession} />
        ) : session.obstacles.length ? (
          <Obstacles session={session} onRecharge={setSession} />
        ) : (
          <Formulaire session={session} onSupprime={() => setSupprime(true)} />
        )}

        <Link to="/confidentialite" className="lien-auth">
          Politique de confidentialité
        </Link>
      </div>
    </MiseEnPageAuth>
  );
}

function CeQuiSePasse() {
  return (
    <div className="suppr-info">
      <p>
        <strong>Qui peut ?</strong> Seul le <strong>patron</strong>. Son compte, son hôtel et tout ce qui lui appartient sont supprimés
        ensemble. Un compte de réception ou de cafétéria ne peut pas être supprimé ici : le patron le retire de son équipe dans
        l'application.
      </p>
      <p>
        <strong>Ce qui est effacé :</strong> les comptes de l'équipe, les chambres, les clients, les réservations, les factures, la
        cafétéria, le stock, les photos et le site de l'hôtel. C'est définitif.
      </p>
      <p>
        <strong>Ce qui est gardé :</strong> le nom de l'hôtel, la date et la raison du départ, et une empreinte non lisible de votre
        numéro (l'essai gratuit ne sert qu'une fois).
      </p>
    </div>
  );
}

function Connexion({ onConnecte }: { onConnecte: (s: Session) => void }) {
  const [parEmail, setParEmail] = useState(false);
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    let identifiant: string | null;
    if (parEmail) {
      identifiant = /^\S+@\S+\.\S+$/.test(email.trim()) ? email.trim() : null;
      if (!identifiant) return setErreur("Saisissez une adresse e-mail valide.");
    } else {
      identifiant = telephoneDepuisSaisie(telephone);
      if (!identifiant) return setErreur("Numéro invalide : 9 chiffres commençant par 8 ou 9 (ex. 970 000 000).");
    }
    if (!motDePasse) return setErreur("Saisissez votre mot de passe.");
    setErreur(null);
    setEnCours(true);
    try {
      const jeton = await connecterViaApi([configuration.apiUrl], identifiant, motDePasse);
      const client = new ClientApi(configuration.apiUrl, () => jeton.accessToken);
      const profil = await client.moi();
      if (profil.role !== Role.PATRON) {
        setErreur(
          "Seul le patron de l'hôtel peut supprimer le compte. Un compte de réception ou de cafétéria est retiré par le patron, dans l'application (Équipe)."
        );
        return;
      }
      const etat = await client.etatSuppressionHotel();
      onConnecte({ client, hotelNom: etat.hotelNom, obstacles: etat.obstacles });
    } catch (err) {
      setErreur(message(err, "Connexion impossible. Réessayez."));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <>
      <CeQuiSePasse />
      <p className="carte-auth__sous-titre">Connectez-vous avec le compte du patron pour continuer.</p>
      <form onSubmit={envoyer} noValidate>
        {parEmail ? (
          <ChampAuth id="suppr-email" libelle="Adresse e-mail" icone={Mail} type="email" autoComplete="username" valeur={email} onChange={setEmail} />
        ) : (
          <div className="champ-auth">
            <label htmlFor="suppr-telephone">Numéro de téléphone</label>
            <ChampTelephone id="suppr-telephone" value={telephone} onChange={setTelephone} required />
          </div>
        )}
        <button type="button" className="lien-auth lien-auth--sans-marge" onClick={() => setParEmail((v) => !v)}>
          {parEmail ? "Utiliser mon numéro de téléphone" : "Ancien compte ? Utiliser mon e-mail"}
        </button>
        <ChampAuth id="suppr-mdp" libelle="Mot de passe" icone={Lock} type="password" autoComplete="current-password" valeur={motDePasse} onChange={setMotDePasse} />
        {erreur && (
          <p className="auth-erreur" role="alert">
            {erreur}
          </p>
        )}
        <button type="submit" className="bouton-auth" disabled={enCours}>
          {enCours ? "Connexion…" : "Continuer"}
        </button>
      </form>
      <Link to="/" className="lien-auth">
        <ArrowLeft size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
        Retour à l'accueil
      </Link>
    </>
  );
}

function Obstacles({ session, onRecharge }: { session: Session; onRecharge: (s: Session) => void }) {
  const [enCours, setEnCours] = useState(false);
  async function verifier() {
    setEnCours(true);
    try {
      const etat = await session.client.etatSuppressionHotel();
      onRecharge({ ...session, obstacles: etat.obstacles });
    } finally {
      setEnCours(false);
    }
  }
  return (
    <>
      <p className="carte-auth__sous-titre">Avant de supprimer « {session.hotelNom} » :</p>
      <ul className="suppr-liste">
        {session.obstacles.map((o) => (
          <li key={o} className="suppr-obstacle">
            {o}
          </li>
        ))}
      </ul>
      <p className="carte-auth__sous-titre">Faites-le dans l'application, puis revenez ici.</p>
      <button type="button" className="bouton-auth" onClick={verifier} disabled={enCours}>
        {enCours ? "Vérification…" : "C'est fait, vérifier à nouveau"}
      </button>
    </>
  );
}

function Formulaire({ session, onSupprime }: { session: Session; onSupprime: () => void }) {
  const [raison, setRaison] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [nom, setNom] = useState("");
  const [compris, setCompris] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function supprimer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      await session.client.supprimerHotel({ raison, commentaire: commentaire.trim() || undefined, confirmationNom: nom });
      onSupprime();
    } catch (err) {
      setErreur(message(err, "Suppression impossible. Réessayez."));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={supprimer} noValidate>
      <fieldset className="suppr-raisons">
        <legend>Pourquoi partez-vous ?</legend>
        {RAISONS.map((r) => (
          <label key={r.valeur} className={`suppr-raison${raison === r.valeur ? " suppr-raison--choisie" : ""}`}>
            <input type="radio" name="raison" value={r.valeur} checked={raison === r.valeur} onChange={() => setRaison(r.valeur)} />
            {r.libelle}
          </label>
        ))}
      </fieldset>
      <div className="champ-auth">
        <label htmlFor="suppr-commentaire">Dites-nous en plus (facultatif)</label>
        <textarea
          id="suppr-commentaire"
          className="suppr-commentaire"
          maxLength={1000}
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          placeholder="Qu'est-ce qui vous pousse à partir ? Qu'aurions-nous pu mieux faire ?"
        />
      </div>
      <ChampAuth
        id="suppr-nom"
        libelle={`Pour confirmer, tapez le nom de votre hôtel : ${session.hotelNom}`}
        icone={Trash2}
        valeur={nom}
        onChange={setNom}
        autoComplete="off"
      />
      <label className="suppr-coche">
        <input type="checkbox" checked={compris} onChange={(e) => setCompris(e.target.checked)} />
        <span>Je comprends que tout sera effacé définitivement : l'hôtel, son équipe, ses clients et son site.</span>
      </label>
      {erreur && (
        <p className="auth-erreur" role="alert">
          {erreur}
        </p>
      )}
      <button type="submit" className="bouton-auth bouton-danger" disabled={!raison || !nom.trim() || !compris || enCours}>
        {enCours ? "Suppression…" : "Supprimer définitivement mon hôtel"}
      </button>
    </form>
  );
}
