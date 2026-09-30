import * as React from "react";
import { Download, MailCheck, Monitor, Smartphone, UserPlus } from "lucide-react";
import { configuration } from "./config";
import { MiseEnPageAuth } from "./auth/MiseEnPageAuth";
import { BoutonsStores } from "./accueil/Stores";

function BoutonTelechargement({ url, icone: Icone, libelle }: { url: string | null; icone: typeof Smartphone; libelle: string }) {
  if (!url) {
    return (
      <span className="telechargement telechargement--bientot" aria-disabled="true">
        <Icone size={20} aria-hidden="true" />
        <span>
          {libelle}
          <small>Lien bientôt disponible</small>
        </span>
      </span>
    );
  }
  return (
    <a className="telechargement" href={url} rel="noopener">
      <Icone size={20} aria-hidden="true" />
      <span>
        {libelle}
        <small>Télécharger</small>
      </span>
      <Download size={18} aria-hidden="true" className="telechargement__fleche" />
    </a>
  );
}

/** Le site n'a pas de session (DECISIONS.md, Phase 8) : après l'inscription, la
 * suite — se connecter, créer les comptes réception et cafétaria — se passe
 * obligatoirement dans l'application. Cet écran l'explique et la fait installer. */
export function EcranSucces({ email }: { email: string }) {
  return (
    <MiseEnPageAuth>
      <div className="carte-auth">
        <img className="carte-auth__logo" src="/logo-hotelsaver.png" alt="" />
        <h1 className="carte-auth__titre">Votre hôtel est créé 🎉</h1>
        <p className="carte-auth__sous-titre">Une dernière étape : installez l'application HotelSaver pour gérer votre hôtel.</p>

        <ol className="parcours">
          <li>
            <MailCheck size={20} aria-hidden="true" />
            <span>
              <strong>Confirmez votre adresse</strong>
              <small>Un e-mail vous a été envoyé à {email}.</small>
            </span>
          </li>
          <li>
            <Smartphone size={20} aria-hidden="true" />
            <span>
              <strong>Installez l'application</strong>
              <small>La connexion se fait uniquement depuis l'application.</small>
            </span>
          </li>
          <li>
            <UserPlus size={20} aria-hidden="true" />
            <span>
              <strong>Créez les comptes de votre équipe</strong>
              <small>Dans « Plus › Utilisateurs » : un compte pour la réception, un pour la cafétaria.</small>
            </span>
          </li>
        </ol>

        <div className="telechargements">
          <BoutonsStores />
          <BoutonTelechargement url={configuration.urlWindows} icone={Monitor} libelle="Application Windows (ordinateur)" />
        </div>
      </div>
    </MiseEnPageAuth>
  );
}
