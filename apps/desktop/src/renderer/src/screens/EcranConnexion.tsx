import * as React from "react";
import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, Lock, Mail, Settings } from "lucide-react";
// Logo de l'APPLICATION HotelSaver — distinct du logo de l'hôtel
// (HotelBranding.logoUrl), voir DECISIONS.md « branding application vs hôtel ».
import logo from "../../../../../../assets/icons/hotelsaver-icone.png";
import photo from "../assets/hotel-chambre-bleue.jpg";

export interface EcranConnexionProps {
  onConnexion: (email: string, motDePasse: string) => void;
  onOuvrirParametres: () => void;
  erreur: string | null;
  enCours: boolean;
}

const ATOUTS = ["Gestion centralisée", "Plus de réservations", "Un support réactif"];

/** Fond pleine page comme la maquette : photo à gauche qui se fond dans la page,
 * carte de connexion au centre de l'écran. Pas de « mot de passe oublié » ni d'inscription ici : ni
 * l'un ni l'autre n'existe côté API (l'inscription se fait sur le site web). */
export function EcranConnexion({ onConnexion, onOuvrirParametres, erreur, enCours }: EcranConnexionProps) {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [visible, setVisible] = useState(false);

  return (
    <div className="hc-auth">
      <div className="hc-auth__photo" style={{ backgroundImage: `url(${photo})` }} aria-hidden="true">
        <div className="hc-auth__voile" />
      </div>
      <aside className="hc-auth__texte">
        <p className="hc-auth__accroche">Bienvenue sur HotelSaver</p>
        <p className="hc-auth__description">
          La plateforme qui simplifie la gestion de votre hôtel et booste vos réservations.
        </p>
        <ul>
          {ATOUTS.map((a) => (
            <li key={a}>
              <CheckCircle2 size={20} aria-hidden="true" />
              {a}
            </li>
          ))}
        </ul>
      </aside>

      <main>
        <div className="hc-auth__carte">
          <img className="hc-auth__logo" src={logo} alt="" />
          <h1 className="hc-auth__marque">HotelSaver</h1>
          <h2 className="hc-auth__titre">Bon retour 👋</h2>
          <p className="hc-auth__sous-titre texte-discret">Connectez-vous à votre espace hôtelier.</p>

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

            {erreur && (
              <p className="hc-auth__erreur" role="alert" data-testid="erreur-connexion">
                {erreur}
              </p>
            )}

            <button type="submit" className="hc-auth__bouton" disabled={enCours}>
              {enCours ? "Connexion…" : "Se connecter"}
            </button>
          </form>

          <button type="button" className="hc-auth__parametres" onClick={onOuvrirParametres}>
            <Settings size={14} aria-hidden="true" /> Paramètres
          </button>
        </div>
      </main>
    </div>
  );
}
