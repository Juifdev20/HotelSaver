import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { ClientApi, ErreurApi, connecterAvecMotDePasse, rafraichirSession } from "@hotel-chicago/api-client";
import type { UtilisateurAuthentifie } from "@hotel-chicago/types";
import type { ConfigurationApp } from "../../main/config-store";
import { IdPage, libellePage } from "./navigation";
import { Coquille } from "./layout/Coquille";
import { EcranConnexion } from "./screens/EcranConnexion";
import { EcranChambres } from "./screens/EcranChambres";
import { EcranFacturation } from "./screens/EcranFacturation";
import { EcranParametres } from "./screens/EcranParametres";
import { EcranTableauDeBord } from "./screens/EcranTableauDeBord";
import { EcranBientot } from "./screens/EcranBientot";

type Ecran = "chargement" | "connexion" | "parametres-hors-connexion" | "application";

const CLE_THEME = "hotel-chicago:theme-sombre";

function themeSombrePrefere(): boolean {
  try {
    return localStorage.getItem(CLE_THEME) === "true";
  } catch {
    return false;
  }
}

/** 404 sur /auth/me = l'adresse répond, mais ce n'est pas le serveur de l'hôtel (ex. un autre projet sur le même port). */
function messageErreurProfil(erreur: Error): string {
  if (erreur instanceof ErreurApi && erreur.statusCode === 404) {
    return "L'adresse de l'API ne correspond pas au serveur de l'hôtel. Vérifiez les Paramètres.";
  }
  return erreur.message;
}

export function App() {
  const [configuration, setConfiguration] = useState<ConfigurationApp | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [utilisateur, setUtilisateur] = useState<UtilisateurAuthentifie | null>(null);
  const [ecran, setEcran] = useState<Ecran>("chargement");
  const [page, setPage] = useState<IdPage>("tableau-de-bord");
  const [rechercheChambres, setRechercheChambres] = useState("");
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
        setEcran("application");
      })
      .catch((erreur: Error) => {
        setErreurConnexion(messageErreurProfil(erreur));
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
    setPage("tableau-de-bord");
    setEcran("connexion");
  }

  async function enregistrerParametres(partielle: Partial<ConfigurationApp>) {
    const nouvelle = await window.hotelChicago.ecrireConfiguration(partielle);
    setConfiguration(nouvelle);
  }

  if (ecran === "chargement" || !configuration) {
    return (
      <div className="hc-page-centree">
        <p className="hc-text-body">Chargement…</p>
      </div>
    );
  }

  if (ecran === "parametres-hors-connexion") {
    return (
      <div className="hc-page-centree">
        <EcranParametres
          configuration={configuration}
          onEnregistrer={enregistrerParametres}
          onRetour={() => setEcran("connexion")}
          themeSombre={themeSombre}
          onBasculerTheme={() => setThemeSombre((v) => !v)}
        />
      </div>
    );
  }

  if (ecran === "application" && client && utilisateur) {
    let contenu: React.ReactNode;
    if (page === "tableau-de-bord") {
      contenu = <EcranTableauDeBord client={client} utilisateur={utilisateur} onNaviguer={setPage} />;
    } else if (page === "chambres") {
      contenu = <EcranChambres client={client} rechercheInitiale={rechercheChambres} onNaviguer={setPage} />;
    } else if (page === "facturation") {
      contenu = <EcranFacturation client={client} />;
    } else if (page === "parametres") {
      contenu = (
        <EcranParametres
          configuration={configuration}
          onEnregistrer={enregistrerParametres}
          client={client}
          utilisateur={utilisateur}
          themeSombre={themeSombre}
          onBasculerTheme={() => setThemeSombre((v) => !v)}
        />
      );
    } else {
      contenu = <EcranBientot titre={libellePage(page)} />;
    }

    return (
      <Coquille
        utilisateur={utilisateur}
        pageActive={page}
        onNaviguer={setPage}
        themeSombre={themeSombre}
        onBasculerTheme={() => setThemeSombre((v) => !v)}
        onDeconnexion={seDeconnecter}
        onRechercherChambre={setRechercheChambres}
      >
        {contenu}
      </Coquille>
    );
  }

  return (
    <EcranConnexion
      onConnexion={seConnecter}
      onOuvrirParametres={() => setEcran("parametres-hors-connexion")}
      erreur={erreurConnexion}
      enCours={connexionEnCours}
    />
  );
}
