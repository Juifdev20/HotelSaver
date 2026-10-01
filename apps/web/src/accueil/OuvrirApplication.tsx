import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { configuration } from "../config";
import { BoutonsStores } from "./Stores";

/** Identifiant Android de l'application (apps/mobile/app.json, android.package). */
const PACKAGE_ANDROID = "com.hotelsaver.app";

/** Lien profond reconnu par l'application mobile ET par l'application Windows
 * (même schéma `hotelsaver://`). `email` pré-remplit l'écran de connexion. */
function lienApplication(email?: string): { direct: string; android: string } {
  const requete = email ? `?email=${encodeURIComponent(email)}` : "";
  const repli = configuration.urlPlayStore ? `S.browser_fallback_url=${encodeURIComponent(configuration.urlPlayStore)};` : "";
  return {
    direct: `hotelsaver://connexion${requete}`,
    // Chrome Android : ouvre l'application si elle est installée, sinon la fiche du Play Store.
    android: `intent://connexion${requete}#Intent;scheme=hotelsaver;package=${PACKAGE_ANDROID};${repli}end`,
  };
}

/**
 * « Ouvrir l'application » + « Pas encore installée ? » (badges des stores).
 *
 * Un navigateur ne peut pas savoir si une application est installée : le bouton tente
 * de l'ouvrir ; si la page reste visible après quelques secondes, c'est que rien ne
 * s'est ouvert, et on le dit en renvoyant vers le téléchargement juste en dessous.
 */
export function OuvrirApplication({ email }: { email?: string }) {
  const [essaye, setEssaye] = useState(false);
  const [introuvable, setIntrouvable] = useState(false);
  const minuteur = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(minuteur.current), []);

  function ouvrir() {
    const { direct, android } = lienApplication(email);
    setEssaye(true);
    setIntrouvable(false);
    window.clearTimeout(minuteur.current);
    // Si l'application s'ouvre, la page passe au second plan (document.hidden).
    minuteur.current = window.setTimeout(() => {
      if (!document.hidden) setIntrouvable(true);
    }, 2500);
    window.location.href = /android/i.test(navigator.userAgent) ? android : direct;
  }

  return (
    <div className="ouvrir-app">
      <button type="button" className="bouton-auth" onClick={ouvrir}>
        <ExternalLink size={18} aria-hidden="true" /> Ouvrir l'application
      </button>
      {essaye && introuvable && (
        <p className="ouvrir-app__introuvable" role="status">
          L'application ne s'est pas ouverte : elle n'est peut-être pas encore installée. Téléchargez-la ci-dessous.
        </p>
      )}
      <p className="auth-aide ouvrir-app__aide">Pas encore installée ?</p>
      <BoutonsStores />
    </div>
  );
}
