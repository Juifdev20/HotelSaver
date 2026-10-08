import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClientApi,
  ErreurApi,
  connecterAvecMotDePasse,
  demanderReinitialisationMotDePasse,
  inscrireHotel,
  rafraichirSession,
} from "@hotel-chicago/api-client";
import { peutOperer } from "@hotel-chicago/types";
import type { InscriptionHotelPayload, LienNotification, NotificationApp, ProfilConnecte } from "@hotel-chicago/types";
import type { ConfigurationApp } from "../../main/config-store";
import { IdPage, libellePage, sectionsPourRole } from "./navigation";
import { useNotifications } from "./useNotifications";
import { Coquille } from "./layout/Coquille";
import { EcranConnexion } from "./screens/EcranConnexion";
import { EcranInscription } from "./screens/EcranInscription";
import { EcranChambres } from "./screens/EcranChambres";
import { EcranReservations } from "./screens/EcranReservations";
import { EcranArriveesDeparts } from "./screens/EcranArriveesDeparts";
import { EcranJourneeReception } from "./screens/EcranJourneeReception";
import { EcranClients } from "./screens/EcranClients";
import { EcranFacturation } from "./screens/EcranFacturation";
import { EcranImprimante } from "./screens/EcranImprimante";
import { EcranParametres } from "./screens/EcranParametres";
import { EcranTableauDeBord } from "./screens/EcranTableauDeBord";
import { EcranUtilisateurs } from "./screens/EcranUtilisateurs";
import { EcranSiteHotel } from "./screens/EcranSiteHotel";
import { EcranCaisse } from "./screens/EcranCaisse";
import { EcranComptesOuverts } from "./screens/EcranComptesOuverts";
import { EcranCompteCafeteria } from "./screens/EcranCompteCafeteria";
import { EcranCuisine } from "./screens/EcranCuisine";
import { EcranRetraitCommande } from "./screens/EcranRetraitCommande";
import { EcranMenu } from "./screens/EcranMenu";
import { EcranStock } from "./screens/EcranStock";
import { EcranInventaire } from "./screens/EcranInventaire";
import { EcranRapports } from "./screens/EcranRapports";
import { EcranDepenses } from "./screens/EcranDepenses";
import { EcranBientot } from "./screens/EcranBientot";

type Ecran = "chargement" | "connexion" | "inscription" | "application";

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
    return "Le serveur HotelSaver est momentanément indisponible. Réessayez dans un instant.";
  }
  return erreur.message;
}

export function App() {
  const [configuration, setConfiguration] = useState<ConfigurationApp | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [utilisateur, setUtilisateur] = useState<ProfilConnecte | null>(null);
  const [ecran, setEcran] = useState<Ecran>("chargement");
  const [page, setPage] = useState<IdPage>("tableau-de-bord");
  const [rechercheChambres, setRechercheChambres] = useState("");
  // Compte cafétaria actuellement ouvert en détail depuis "Caisse" ou
  // "Comptes ouverts" (les deux mènent au même écran de détail) — remis à
  // zéro à chaque navigation pour ne jamais montrer un détail périmé en
  // revenant sur l'une de ces deux pages (voir naviguer() plus bas).
  const [compteCafeteriaOuvert, setCompteCafeteriaOuvert] = useState<string | null>(null);
  // Compte ouvert par « Vente rapide » : l'ajout s'ouvre directement, scanner prêt.
  const [venteRapide, setVenteRapide] = useState(false);
  // Séjour à ouvrir directement dans l'écran Facturation (deep-link depuis
  // Réservations ou Arrivées et départs) — remis à zéro par naviguer().
  const [reservationAFacturer, setReservationAFacturer] = useState<string | null>(null);
  const [erreurConnexion, setErreurConnexion] = useState<string | null>(null);
  const [connexionEnCours, setConnexionEnCours] = useState(false);
  // Pré-remplissage / message de la connexion (après une inscription, ou un lien « Ouvrir l'application »).
  const [emailPreRempli, setEmailPreRempli] = useState<string | undefined>(undefined);
  const [messageConnexion, setMessageConnexion] = useState<string | null>(null);
  const [erreurInscription, setErreurInscription] = useState<string | null>(null);
  const [inscriptionEnCours, setInscriptionEnCours] = useState(false);
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

  // Lien profond « Ouvrir l'application » du site web (hotelsaver://connexion?email=…) : gardé en
  // attente puis appliqué dès que l'écran de départ est connu, pour que la logique de démarrage
  // (reconnexion silencieuse) ne l'écrase pas. Déjà connecté : ignoré.
  const lienEnAttente = useRef<string | null>(null);
  const [lienRecu, setLienRecu] = useState(0);

  useEffect(() => {
    const signaler = (url: string | null) => {
      if (!url) return;
      lienEnAttente.current = url;
      setLienRecu((n) => n + 1);
    };
    void window.hotelChicago.lireLienEnAttente().then(signaler);
    return window.hotelChicago.surLienOuvert(signaler);
  }, []);

  useEffect(() => {
    const url = lienEnAttente.current;
    if (!url || ecran === "chargement") return;
    lienEnAttente.current = null;
    const m = /^hotelsaver:\/\/connexion(?:\?(.*))?$/i.exec(url);
    if (!m || ecran === "application") return;
    setEmailPreRempli(new URLSearchParams(m[1] ?? "").get("email") ?? undefined);
    setMessageConnexion("Connectez-vous avec le compte que vous venez de créer.");
    setErreurConnexion(null);
    setEcran("connexion");
  }, [lienRecu, ecran]);

  // Le jeton d'accès expire (~1 h) : le client lit toujours la valeur COURANTE via cette référence,
  // pour qu'un renouvellement ne recrée pas le client (et ne recharge pas les écrans).
  const jetonCourant = useRef<string | null>(null);
  jetonCourant.current = accessToken;
  const connecte = accessToken !== null;
  const client = useMemo(
    () => (configuration && connecte ? new ClientApi(configuration.apiUrl, () => jetonCourant.current) : null),
    [configuration, connecte]
  );

  // Application laissée ouverte (ou réduite dans la zone de notification) toute la journée :
  // sans renouvellement périodique, l'écoute des notifications et les écrans passeraient en 401.
  useEffect(() => {
    if (!connecte || !configuration) return;
    const renouveler = async () => {
      try {
        const actuelle = await window.hotelChicago.lireConfiguration();
        if (!actuelle.refreshToken) return;
        const session = await rafraichirSession({ url: actuelle.supabaseUrl, anonKey: actuelle.supabaseAnonKey }, actuelle.refreshToken);
        await window.hotelChicago.ecrireConfiguration({ refreshToken: session.refreshToken });
        jetonCourant.current = session.accessToken;
      } catch {
        // Réseau coupé : on réessaie au prochain passage ; le jeton actuel reste valable un moment.
      }
    };
    const minuteur = setInterval(() => void renouveler(), 40 * 60 * 1000);
    return () => clearInterval(minuteur);
  }, [connecte, configuration]);

  /** Clic sur une notification (cloche ou notification Windows) → l'écran concerné, si mon rôle y a droit. */
  const ouvrirLien = (lien: LienNotification) => {
    if (!utilisateur) return;
    const autorisees = sectionsPourRole(utilisateur.role, peutOperer(utilisateur), utilisateur.cuisineActivee === true).flatMap((section) => section.entrees.map((entree) => entree.id as string));
    setReservationAFacturer(null);
    // Un lien « comptes-ouverts » porte l'id du compte : on ouvre le détail
    // directement (notification commande web) plutôt que la liste.
    if (lien.ecran === "comptes-ouverts" && lien.id && autorisees.includes("comptes-ouverts")) {
      setCompteCafeteriaOuvert(lien.id);
      setPage("comptes-ouverts");
      return;
    }
    setCompteCafeteriaOuvert(null);
    const cible = autorisees.includes(lien.ecran) ? (lien.ecran as IdPage) : "tableau-de-bord";
    setPage(cible);
  };
  const lienRef = useRef(ouvrirLien);
  lienRef.current = ouvrirLien;
  const centre = useNotifications(ecran === "application" ? client : null, (lien) => lienRef.current(lien));
  const ouvrirNotification = (notification: NotificationApp) => {
    void centre.marquerLue(notification.id);
    ouvrirLien(notification.lien);
  };

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

  // Recharge le profil toutes les 30 s et au retour de focus : un réglage hôtel
  // changé par le patron sur un autre appareil (ex. suivi cuisine) se propage
  // sans relancer l'app. Le state n'est remplacé que si le profil a changé.
  useEffect(() => {
    if (!client || !utilisateur) return;
    let annule = false;
    const rafraichir = () =>
      client
        .moi()
        .then((frais) => {
          if (!annule) setUtilisateur((courant) => (JSON.stringify(courant) === JSON.stringify(frais) ? courant : frais));
        })
        .catch(() => undefined);
    const minuteur = setInterval(rafraichir, 30_000);
    window.addEventListener("focus", rafraichir);
    return () => {
      annule = true;
      clearInterval(minuteur);
      window.removeEventListener("focus", rafraichir);
    };
  }, [client, utilisateur?.userId]);

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

  /** Inscription d'un hôtel DANS l'application (jamais sur le site web). Même enchaînement
   * que le mobile : création, puis connexion immédiate si le compte est déjà utilisable. */
  async function sInscrire(dto: InscriptionHotelPayload) {
    if (!configuration) return;
    setErreurInscription(null);
    setInscriptionEnCours(true);
    try {
      await inscrireHotel({ url: configuration.apiUrl }, dto);
      try {
        // Le compte est créé avec email_confirm: false (DECISIONS.md, Phase 4) : la première
        // connexion peut échouer tant que l'adresse n'est pas confirmée. L'hôtel existe bien :
        // on n'affiche donc jamais l'erreur brute de connexion.
        const session = await connecterAvecMotDePasse(
          { url: configuration.supabaseUrl, anonKey: configuration.supabaseAnonKey },
          dto.email,
          dto.motDePasse
        );
        await window.hotelChicago.ecrireConfiguration({ refreshToken: session.refreshToken });
        setAccessToken(session.accessToken);
      } catch {
        setEmailPreRempli(dto.email);
        setMessageConnexion("Compte créé ! Vérifiez votre boîte mail pour confirmer votre adresse avant de vous connecter.");
        setEcran("connexion");
      }
    } catch (erreur) {
      setErreurInscription(erreur instanceof Error ? erreur.message : "Erreur lors de l'inscription.");
    } finally {
      setInscriptionEnCours(false);
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

  /** Toute navigation explicite (barre latérale, tableau de bord...) referme
   * un éventuel détail de compte cafétaria resté ouvert — sans ça, revenir
   * sur "Caisse" ou "Comptes ouverts" montrerait le détail périmé de la
   * dernière visite au lieu du formulaire/de la liste. */
  function naviguer(nouvellePage: IdPage) {
    setCompteCafeteriaOuvert(null);
    setReservationAFacturer(null);
    setPage(nouvellePage);
  }

  /** Deep-link vers le détail d'encaissement d'un séjour dans Facturation —
   * contrairement à naviguer() on pose d'abord le contexte, puis la page. */
  function naviguerVersFacturation(reservationId: string) {
    setCompteCafeteriaOuvert(null);
    setReservationAFacturer(reservationId);
    setPage("facturation");
  }

  if (ecran === "chargement" || !configuration) {
    return (
      <div className="hc-page-centree">
        <p className="hc-text-body">Chargement…</p>
      </div>
    );
  }

  if (ecran === "application" && client && utilisateur) {
    let contenu: React.ReactNode;
    if (page === "tableau-de-bord") {
      contenu = <EcranTableauDeBord client={client} utilisateur={utilisateur} onNaviguer={naviguer} />;
    } else if (page === "chambres") {
      contenu = <EcranChambres client={client} utilisateur={utilisateur} rechercheInitiale={rechercheChambres} onNaviguer={naviguer} />;
    } else if (page === "reservations") {
      contenu = <EcranReservations client={client} onNaviguer={naviguer} onFacturer={naviguerVersFacturation} peutOperer={peutOperer(utilisateur)} />;
    } else if (page === "arrivees-departs") {
      contenu = <EcranArriveesDeparts client={client} onNaviguer={naviguer} onFacturer={naviguerVersFacturation} peutOperer={peutOperer(utilisateur)} />;
    } else if (page === "journal-journee") {
      contenu = <EcranJourneeReception client={client} />;
    } else if (page === "clients") {
      contenu = <EcranClients client={client} />;
    } else if (page === "facturation") {
      contenu = (
        <EcranFacturation
          client={client}
          utilisateur={utilisateur}
          interfaceImprimante={configuration.imprimanteInterface}
          reservationInitiale={reservationAFacturer}
        />
      );
    } else if (page === "caisse" || page === "comptes-ouverts") {
      // Les deux entrées mènent au même écran de détail une fois un compte
      // choisi/créé — voir compteCafeteriaOuvert plus haut.
      contenu = compteCafeteriaOuvert ? (
        <EcranCompteCafeteria
          client={client}
          utilisateur={utilisateur}
          compteId={compteCafeteriaOuvert}
          interfaceImprimante={configuration.imprimanteInterface}
          ouvrirAjoutAuDemarrage={venteRapide}
          onRetour={() => {
            setCompteCafeteriaOuvert(null);
            setVenteRapide(false);
          }}
        />
      ) : page === "caisse" ? (
        <EcranCaisse
          client={client}
          onCompteOuvert={(id, options) => {
            setVenteRapide(options?.venteRapide === true);
            setCompteCafeteriaOuvert(id);
          }}
        />
      ) : (
        <EcranComptesOuverts
          client={client}
          utilisateur={utilisateur}
          interfaceImprimante={configuration.imprimanteInterface}
          onOuvrirCompte={setCompteCafeteriaOuvert}
        />
      );
    } else if (page === "cuisine") {
      contenu = (
        <EcranCuisine
          client={client}
          onOuvrirCompte={(compteId) => {
            setCompteCafeteriaOuvert(compteId);
            setPage("comptes-ouverts");
          }}
        />
      );
    } else if (page === "retrait-commande") {
      contenu = (
        <EcranRetraitCommande
          client={client}
          onOuvrirCompte={(compteId) => {
            setCompteCafeteriaOuvert(compteId);
            setPage("comptes-ouverts");
          }}
        />
      );
    } else if (page === "menu") {
      contenu = <EcranMenu client={client} utilisateur={utilisateur} interfaceImprimante={configuration.imprimanteInterface} />;
    } else if (page === "stock") {
      contenu = <EcranStock client={client} />;
    } else if (page === "inventaire") {
      contenu = <EcranInventaire client={client} utilisateur={utilisateur} />;
    } else if (page === "imprimante") {
      contenu = (
        <EcranImprimante
          interfaceImprimante={configuration.imprimanteInterface}
          onEnregistrer={enregistrerParametres}
          onRetour={() => naviguer("parametres")}
        />
      );
    } else if (page === "site-hotel") {
      contenu = <EcranSiteHotel client={client} />;
    } else if (page === "rapports") {
      contenu = <EcranRapports client={client} utilisateur={utilisateur} />;
    } else if (page === "depenses") {
      contenu = <EcranDepenses client={client} utilisateur={utilisateur} />;
    } else if (page === "utilisateurs") {
      contenu = <EcranUtilisateurs client={client} />;
    } else if (page === "parametres") {
      contenu = (
        <EcranParametres

          client={client}
          utilisateur={utilisateur}
          onNaviguer={naviguer}
          themeSombre={themeSombre}
          onBasculerTheme={() => setThemeSombre((v) => !v)}
          onProfilModifie={() => void client.moi().then(setUtilisateur).catch(() => undefined)}
        />
      );
    } else {
      contenu = <EcranBientot titre={libellePage(page)} />;
    }

    return (
      <Coquille
        utilisateur={utilisateur}
        pageActive={page}
        onNaviguer={naviguer}
        themeSombre={themeSombre}
        onBasculerTheme={() => setThemeSombre((v) => !v)}
        onDeconnexion={seDeconnecter}
        onRechercherChambre={setRechercheChambres}
        notifications={centre.notifications}
        nonLues={centre.nonLues}
        onOuvrirNotification={ouvrirNotification}
        onToutMarquerLu={() => void centre.toutMarquerLu()}
      >
        {contenu}
      </Coquille>
    );
  }

  if (ecran === "inscription") {
    return (
      <EcranInscription
        erreur={erreurInscription}
        enCours={inscriptionEnCours}
        onSoumettre={sInscrire}
        onRetourConnexion={() => {
          setErreurInscription(null);
          setEcran("connexion");
        }}
      />
    );
  }

  return (
    <EcranConnexion
      key={emailPreRempli ?? "connexion"}
      onConnexion={seConnecter}
      onMotDePasseOublie={async (email) => {
        await demanderReinitialisationMotDePasse({ url: configuration.apiUrl }, email);
      }}
      onCreerCompte={() => {
        setErreurConnexion(null);
        setMessageConnexion(null);
        setErreurInscription(null);
        setEcran("inscription");
      }}
      emailInitial={emailPreRempli}
      message={messageConnexion}
      erreur={erreurConnexion}
      enCours={connexionEnCours}
    />
  );
}
