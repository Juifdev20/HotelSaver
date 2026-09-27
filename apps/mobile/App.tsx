import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { ActivityIndicator, Animated, Image, StyleSheet, View } from "react-native";
import { ClientApi, ErreurApi, connecterAvecMotDePasse, inscrireHotel, rafraichirSession } from "@hotel-chicago/api-client";
import { MoteurSync } from "@hotel-chicago/sync-engine";
import type { InscriptionHotelPayload, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { lireConfiguration, type ConfigurationApp } from "./src/stockage/configuration";
import { creerStockageLocalMobile } from "./src/stockage/stockageLocalMobile";
import {
  ProfilEnregistre,
  ecrireDernierUtilisateur,
  ecrireJetonRafraichissement,
  enregistrerProfil,
  lireDernierUtilisateur,
  lireJetonRafraichissement,
  listerProfils,
  oublierProfil,
} from "./src/stockage/profils";
import { EcranSelectionProfil } from "./src/ecrans/EcranSelectionProfil";
import { EcranConnexion } from "./src/ecrans/EcranConnexion";
import { EcranInscription } from "./src/ecrans/EcranInscription";
import { CoquilleOnglets } from "./src/CoquilleOnglets";
import { FournisseurSession } from "./src/contexteSession";

type Ecran = "chargement" | "selection-profil" | "connexion" | "inscription" | "application";

/** Délai avant l'apparition du spinner sur l'écran de démarrage : le logo
 * HotelSaver s'affiche seul d'abord, puis le widget de chargement rejoint —
 * séquence visible à l'oeil même quand l'initialisation est instantanée. */
const DELAI_APPARITION_SPINNER_MS = 1200;

/** Durée minimale totale de l'écran de démarrage : garantit que la séquence
 * logo → spinner est réellement vue, et que le démarrage ne donne pas
 * l'impression d'un flash avant le tableau de bord ou la connexion. */
const DUREE_MINIMALE_DEMARRAGE_MS = 2600;

/** Écran de démarrage brandé : badge HotelSaver centré sur navy #053483
 * (identique au splash natif → transition invisible), puis le spinner
 * apparaît en fondu après DELAI_APPARITION_SPINNER_MS. */
function EcranDemarrage() {
  const fonduSpinner = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const minuteur = setTimeout(() => {
      Animated.timing(fonduSpinner, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }).start();
    }, DELAI_APPARITION_SPINNER_MS);
    return () => clearTimeout(minuteur);
  }, [fonduSpinner]);

  return (
    // Mesuré sur appareil (captures d'écran en rafale au démarrage) : même
    // avec un double requestAnimationFrame, un écran noir franc apparaît
    // AVANT que ce fond navy n'apparaisse — la surface Fabric reste noire
    // par défaut pendant que React Native finit de démarrer, largement au-
    // delà de deux frames. onLayout + rAF garantissent seulement qu'une
    // image a été commise, pas que la surface est déjà prête à composer ;
    // la marge fixe ci-dessous couvre l'écart réellement observé. Un
    // splash natif affiché un peu plus longtemps est invisible pour
    // l'utilisateur ; un écran noir au milieu ne l'est pas.
    <View
      style={styles.chargement}
      onLayout={() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              void SplashScreen.hideAsync();
            }, 400);
          });
        });
      }}
    >
      <Image source={require("./assets/hotelsaver-logo.png")} style={styles.logoDemarrage} resizeMode="contain" />
      {/* Hauteur fixe réservée : l'apparition du spinner ne déplace pas le logo. */}
      <View style={styles.zoneSpinner}>
        <Animated.View style={{ opacity: fonduSpinner }}>
          <ActivityIndicator color="#FFFFFF" size="large" />
        </Animated.View>
      </View>
    </View>
  );
}

/** 404 sur /auth/me = l'adresse répond mais ce n'est pas le serveur de l'hôtel. */
function messageErreurProfil(erreur: Error): string {
  if (erreur instanceof ErreurApi && erreur.statusCode === 404) {
    return "L'adresse de l'API ne correspond pas au serveur de l'hôtel. Vérifiez les Paramètres.";
  }
  return erreur.message;
}

export default function App() {
  const [configuration, setConfiguration] = useState<ConfigurationApp | null>(null);
  const [profils, setProfils] = useState<ProfilEnregistre[]>([]);
  const [ecran, setEcran] = useState<Ecran>("chargement");
  const [emailPreRempli, setEmailPreRempli] = useState<string | undefined>(undefined);
  const [messageConnexion, setMessageConnexion] = useState<string | null>(null);
  const [erreurConnexion, setErreurConnexion] = useState<string | null>(null);
  const [connexionEnCours, setConnexionEnCours] = useState(false);
  const [erreurInscription, setErreurInscription] = useState<string | null>(null);
  const [inscriptionEnCours, setInscriptionEnCours] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [utilisateur, setUtilisateur] = useState<UtilisateurAuthentifie | null>(null);

  const client = useMemo(
    () => (configuration && accessToken ? new ClientApi(configuration.apiUrl, () => accessToken) : null),
    [configuration, accessToken]
  );

  const [moteurSync, setMoteurSync] = useState<MoteurSync | null>(null);

  // Démarre le moteur de synchronisation dès qu'un client est disponible
  // (connexion réussie), l'arrête si le client disparaît (changerDeProfil).
  // La base SQLite sous-jacente est partagée par l'appareil (pas par
  // profil — voir sqlite.ts) : seul le minuteur du moteur démarre/s'arrête ici.
  useEffect(() => {
    if (!client) {
      setMoteurSync(null);
      return;
    }
    let annule = false;
    let moteurCree: MoteurSync | null = null;
    (async () => {
      const stockage = await creerStockageLocalMobile();
      if (annule) return;
      moteurCree = new MoteurSync(client, stockage, ["Chambre", "Produit", "CompteCafeteria", "SousCompte", "LigneCommande"]);
      moteurCree.demarrer();
      setMoteurSync(moteurCree);
    })();
    return () => {
      annule = true;
      moteurCree?.arreter();
    };
  }, [client]);

  // Démarrage : charge la config puis la liste des profils déjà connectés
  // sur cet appareil (section 5, "sélection de profil au démarrage").
  useEffect(() => {
    const debutDemarrage = Date.now();
    // Garantit DUREE_MINIMALE_DEMARRAGE_MS d'affichage de l'écran de démarrage
    // avant toute transition — la séquence logo → spinner reste visible même
    // quand l'initialisation est instantanée (stockage local, session valide).
    const attendreDureeMinimale = () =>
      new Promise<void>((resolve) =>
        setTimeout(resolve, Math.max(0, DUREE_MINIMALE_DEMARRAGE_MS - (Date.now() - debutDemarrage)))
      );

    (async () => {
      const config = await lireConfiguration();
      setConfiguration(config);
      const liste = await listerProfils();
      setProfils(liste);
      
      // Si aucun profil, aller à l'écran de connexion
      if (liste.length === 0) {
        await attendreDureeMinimale();
        setEcran("connexion");
        return;
      }

      // Reconnexion silencieuse au dernier profil utilisé sur cet appareil
      // (le seul s'il n'y en a qu'un) — évite de repasser par la sélection de
      // profil à chaque lancement quand ce n'est pas un appareil partagé.
      const dernierId = liste.length === 1 ? liste[0].utilisateurId : await lireDernierUtilisateur();
      const profil = liste.find((p) => p.utilisateurId === dernierId);
      if (profil) {
        const jeton = await lireJetonRafraichissement(profil.utilisateurId);
        if (jeton) {
          try {
            const session = await rafraichirSession(
              { url: config.supabaseUrl, anonKey: config.supabaseAnonKey },
              jeton
            );
            await attendreDureeMinimale();
            await terminerConnexion(session, config, profil.email);
            return;
          } catch {
            // Session invalide, continuer vers sélection de profil
          }
        }
      }

      // Sinon, afficher l'écran de sélection de profil
      await attendreDureeMinimale();
      setEcran("selection-profil");
    })();
  }, []);

  async function terminerConnexion(session: { accessToken: string; refreshToken: string }, config: ConfigurationApp, email: string) {
    const clientTemporaire = new ClientApi(config.apiUrl, () => session.accessToken);
    const donnees = await clientTemporaire.moi();
    await enregistrerProfil({ utilisateurId: donnees.userId, nom: donnees.nom, role: donnees.role, email });
    await ecrireJetonRafraichissement(donnees.userId, session.refreshToken);
    await ecrireDernierUtilisateur(donnees.userId);
    setUtilisateur(donnees);
    setAccessToken(session.accessToken);
    setEcran("application");
  }

  async function choisirProfil(profil: ProfilEnregistre) {
    if (!configuration) return;
    const jeton = await lireJetonRafraichissement(profil.utilisateurId);
    if (!jeton) {
      setEmailPreRempli(profil.email);
      setMessageConnexion("Reconnectez-vous pour continuer.");
      setEcran("connexion");
      return;
    }
    try {
      const session = await rafraichirSession(
        { url: configuration.supabaseUrl, anonKey: configuration.supabaseAnonKey },
        jeton
      );
      await terminerConnexion(session, configuration, profil.email);
    } catch {
      // Session expirée/invalide : redemande le mot de passe, sans supprimer
      // le profil (l'utilisateur pourrait juste être hors ligne).
      setEmailPreRempli(profil.email);
      setMessageConnexion("Votre session a expiré. Reconnectez-vous.");
      setEcran("connexion");
    }
  }

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
      await terminerConnexion(session, configuration, email);
    } catch (erreur) {
      setErreurConnexion(erreur instanceof Error ? messageErreurProfil(erreur) : "Erreur de connexion.");
    } finally {
      setConnexionEnCours(false);
    }
  }

  async function sInscrire(dto: InscriptionHotelPayload) {
    if (!configuration) return;
    setErreurInscription(null);
    setInscriptionEnCours(true);
    try {
      await inscrireHotel({ url: configuration.apiUrl }, dto);
      try {
        // Le compte Supabase créé côté serveur a email_confirm: false (choix
        // volontaire, voir DECISIONS.md Phase 4) : la première connexion peut
        // échouer tant que l'email n'est pas confirmé. Ce n'est pas un échec
        // d'inscription — l'hôtel existe bel et bien — donc on ne réaffiche
        // jamais l'erreur brute de connexion ici (ex. "Contactez le patron"
        // n'aurait aucun sens pour quelqu'un qui vient de créer SON compte).
        const session = await connecterAvecMotDePasse(
          { url: configuration.supabaseUrl, anonKey: configuration.supabaseAnonKey },
          dto.email,
          dto.motDePasse
        );
        await terminerConnexion(session, configuration, dto.email);
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

  async function retourSelectionProfil() {
    const liste = await listerProfils();
    setProfils(liste);
    setErreurConnexion(null);
    setMessageConnexion(null);
    setEmailPreRempli(undefined);
    setEcran(liste.length > 0 ? "selection-profil" : "connexion");
  }

  /** "Changer de profil" depuis le tableau de bord : referme la session en
   * cours mais garde le profil enregistré (jeton compris) pour un retour rapide. */
  function changerDeProfil() {
    setAccessToken(null);
    setUtilisateur(null);
    retourSelectionProfil();
  }

  // Le second cas couvre le bref instant entre la connexion réussie et
  // l'ouverture de la base SQLite locale (asynchrone, voir useEffect
  // ci-dessus) — sans lui, un écran vide apparaîtrait entre les deux.
  // Même logo et même fond que le splash natif (app.json) : la transition
  // natif → JS est invisible, à la manière des splash de Facebook.
  if (ecran === "chargement" || !configuration || (ecran === "application" && !moteurSync)) {
    return <EcranDemarrage />;
  }

  if (ecran === "selection-profil") {
    return (
      <EcranSelectionProfil
        profils={profils}
        onChoisir={choisirProfil}
        onAjouterCompte={() => {
          setEmailPreRempli(undefined);
          setMessageConnexion(null);
          setEcran("connexion");
        }}
        onOublierProfil={async (profil) => {
          await oublierProfil(profil.utilisateurId);
          setProfils(await listerProfils());
        }}
      />
    );
  }

  if (ecran === "connexion") {
    return (
      <EcranConnexion
        emailInitial={emailPreRempli}
        message={messageConnexion}
        erreur={erreurConnexion}
        enCours={connexionEnCours}
        onConnexion={seConnecter}
        onRetour={profils.length > 0 ? retourSelectionProfil : undefined}
        onCreerCompte={() => {
          setErreurInscription(null);
          setEcran("inscription");
        }}
      />
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

  if (ecran === "application" && client && utilisateur && moteurSync) {
    return (
      <SafeAreaProvider>
        <FournisseurSession session={{ client, utilisateur, changerDeProfil, moteurSync }}>
          <NavigationContainer>
            <CoquilleOnglets />
          </NavigationContainer>
        </FournisseurSession>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  chargement: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#053483" },
  logoDemarrage: { width: 180, height: 180 },
  // 32 de marge + ~40 pour le spinner : espace réservé avant son apparition
  // pour que le logo ne bouge jamais.
  zoneSpinner: { marginTop: 32, height: 40, justifyContent: "center" },
});
