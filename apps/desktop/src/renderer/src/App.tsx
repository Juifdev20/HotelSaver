import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { ClientApi, connecterAvecMotDePasse, rafraichirSession } from "@hotel-chicago/api-client";
import type { UtilisateurAuthentifie } from "@hotel-chicago/types";
import type { ConfigurationApp } from "../../main/config-store";
import { EcranConnexion } from "./screens/EcranConnexion";
import { EcranChambres } from "./screens/EcranChambres";
import { EcranParametres } from "./screens/EcranParametres";

type Ecran = "chargement" | "connexion" | "chambres" | "parametres";

const CLE_THEME = "hotel-chicago:theme-sombre";

function themeSombrePrefere(): boolean {
  try {
    return localStorage.getItem(CLE_THEME) === "true";
  } catch {
    return false;
  }
}

export function App() {
  const [configuration, setConfiguration] = useState<ConfigurationApp | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [utilisateur, setUtilisateur] = useState<UtilisateurAuthentifie | null>(null);
  const [ecran, setEcran] = useState<Ecran>("chargement");
  const [erreurConnexion, setErreurConnexion] = useState<string | null>(null);
  const [connexionEnCours, setConnexionEnCours] = useState(false);
  const [themeSombre, setThemeSombre] = useState(themeSombrePrefere);

  useEffect(() => {
    document.documentElement.dataset.theme = themeSombre ? "dark" : "light";
    try {
      localStorage.setItem(CLE_THEME, String(themeSombre));
    } catch {
      // Stockage indisponible (ex. contexte de test) : le thème reste actif
      // pour la session en cours, simplement pas mémorisé pour la prochaine.
    }
  }, [themeSombre]);

  // Au démarrage : charge la configuration, puis tente un rafraîchissement
  // silencieux de session si un refreshToken est déjà mémorisé (section 14 :
  // rester connecté en permanence entre deux lancements de l'app).
  useEffect(() => {
    window.hotelChicago.lireConfiguration().then(async (config) => {
      setConfiguration(config);
      if (config.refreshToken) {
        try {
          const session = await rafraichirSession(
            { url: config.supabaseUrl, anonKey: config.supabaseAnonKey },
            config.refreshToken
          );
          await window.hotelChicago.ecrireConfiguration({ refreshToken: session.refreshToken });
          setAccessToken(session.accessToken);
          return;
        } catch {
          // Session périmée/invalide : retour à l'écran de connexion, sans erreur bloquante.
        }
      }
      setEcran("connexion");
    });
  }, []);

  const client = useMemo(
    () => (configuration && accessToken ? new ClientApi(configuration.apiUrl, () => accessToken) : null),
    [configuration, accessToken]
  );

  useEffect(() => {
    if (!client) return;
    client
      .moi()
      .then((donnees) => {
        setUtilisateur(donnees);
        setEcran("chambres");
      })
      .catch((erreur: Error) => {
        setErreurConnexion(erreur.message);
        setEcran("connexion");
      });
  }, [client]);

  async function seConnecter(email: string, motDePasse: string) {
    if (!configuration) return;
    setErreurConnexion(null);
    setConnexionEnCours(true);
    try {
      const session = await connecterAvecMotDePasse(
        { url: configuration.supabaseUrl, anonKey: configuration.supabaseAnonKey },
        email,
        motDePasse
      );
      await window.hotelChicago.ecrireConfiguration({ refreshToken: session.refreshToken });
      setAccessToken(session.accessToken);
    } catch (erreur) {
      setErreurConnexion(erreur instanceof Error ? erreur.message : "Erreur de connexion.");
    } finally {
      setConnexionEnCours(false);
    }
  }

  async function seDeconnecter() {
    await window.hotelChicago.ecrireConfiguration({ refreshToken: null });
    setAccessToken(null);
    setUtilisateur(null);
    setEcran("connexion");
  }

  async function enregistrerParametres(partielle: Partial<ConfigurationApp>) {
    const nouvelle = await window.hotelChicago.ecrireConfiguration(partielle);
    setConfiguration(nouvelle);
  }

  if (ecran === "chargement" || !configuration) {
    return <p className="hc-text-body">Chargement…</p>;
  }

  if (ecran === "parametres") {
    return (
      <EcranParametres
        configuration={configuration}
        onEnregistrer={enregistrerParametres}
        onRetour={() => setEcran(utilisateur ? "chambres" : "connexion")}
      />
    );
  }

  if (ecran === "chambres" && client && utilisateur) {
    return (
      <EcranChambres
        client={client}
        utilisateur={utilisateur}
        themeSombre={themeSombre}
        onBasculerTheme={() => setThemeSombre((v) => !v)}
        onOuvrirParametres={() => setEcran("parametres")}
        onDeconnexion={seDeconnecter}
      />
    );
  }

  return (
    <EcranConnexion
      onConnexion={seConnecter}
      onOuvrirParametres={() => setEcran("parametres")}
      erreur={erreurConnexion}
      enCours={connexionEnCours}
    />
  );
}
