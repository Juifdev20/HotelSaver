import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { ClientApi, ErreurApi, connecterAvecMotDePasse, inscrireHotel, rafraichirSession } from "@hotel-chicago/api-client";
import { MoteurSync } from "@hotel-chicago/sync-engine";
import { Role, type InscriptionHotelPayload, type UtilisateurAuthentifie } from "@hotel-chicago/types";
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

/** Durée minimale, comptée depuis le montage JS (donc à peu près depuis le
 * lancement natif), avant de quitter cet écran. Le voile natif (premier
 * écran, logo + slogan — voir withSurfaceTranslucide.js) couvre tout ce qui
 * se passe côté JS pendant ~1500 ms minimum ; sans marge supplémentaire ici,
 * une session déjà valide (vérification quasi instantanée, stockage local)
 * fait passer l'écran de chargement directement au tableau de bord PENDANT
 * qu'il est encore caché sous le voile — l'utilisateur ne le voit alors
 * jamais. 2500 ms garantit qu'il reste visible ~1 s de plus une fois le
 * voile retiré, quelle que soit la rapidité de la vérification réelle. */
const DUREE_MINIMALE_CHARGEMENT_MS = 2500;

/** Seul écran de démarrage côté JS : logo à taille réduite + widget de
 * chargement, affiché pendant la vérification réelle de la session
 * (configuration, profils, rafraîchissement du jeton). Le voile natif
 * (logo grande taille + slogan) reste visible par-dessus jusqu'à ce que ce
 * rendu soit commis (CONTENT_APPEARED, voir le plugin) — la transition
 * natif → JS montre donc un contenu différent (plus petit, avec spinner),
 * jamais une répétition.
 *
 * Réutilisé aussi en surimpression lors du passage vers le tableau de bord
 * (`onPret`, passé uniquement à ce moment-là) : monter tout l'arbre de
 * navigation (onglets, écrans) prend un instant avant sa première image
 * réelle — sans ce voile, on voit passer le fond bleu de la fenêtre pendant
 * ce court instant (mesuré sur appareil). */
function EcranChargement({ onPret }: { onPret?: () => void }) {
  return (
    <View
      style={styles.chargement}
      onLayout={() => {
        // Mesuré sur appareil (captures d'écran en rafale au démarrage) :
        // onLayout garantit une mesure, pas un rendu déjà composé à l'écran —
        // le double requestAnimationFrame + la marge fixe attendent qu'une
        // vraie image ait été affichée avant de lever le splash JS (le voile
        // natif, lui, se retire séparément sur CONTENT_APPEARED, voir le plugin).
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              void SplashScreen.hideAsync();
              onPret?.();
            }, 400);
          });
        });
      }}
    >
      <Image source={require("./assets/hotelsaver-logo.png")} style={styles.logoChargement} resizeMode="contain" />
      <ActivityIndicator color="#FFFFFF" size="large" style={styles.spinnerChargement} />
      <Text style={styles.texteChargement}>Veuillez patienter…</Text>
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

  // Le tableau de bord (CoquilleOnglets, plus bas) est un tout nouvel arbre
  // de navigation à chaque connexion/changement de profil : redémarre à
  // false pour que la surimpression de chargement le couvre le temps qu'il
  // peigne sa première image réelle (voir le rendu de l'écran "application").
  // Remise à zéro PENDANT le rendu (pas dans un useEffect) : quand "client"
  // redevient non-nul après un changement de profil, un useEffect ne
  // remettrait applicationPrete à false qu'au rendu SUIVANT, laissant passer
  // un premier rendu de l'arbre lourd sans aucune surimpression par-dessus
  // (mesuré sur appareil : fond bleu nu juste après l'écran de chargement).
  // (Pendant la phase "chargement" initiale, applicationPrete reste false :
  // la surimpression n'y reçoit pas de onPret — voir le rendu plus bas.)
  const [applicationPrete, setApplicationPrete] = useState(false);
  const dernierClientRef = useRef(client);
  if (dernierClientRef.current !== client) {
    dernierClientRef.current = client;
    if (applicationPrete) {
      setApplicationPrete(false);
    }
  }

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
      moteurCree = new MoteurSync(client, stockage, [
        "Chambre",
        "Reservation",
        "Client",
        "Produit",
        "CompteCafeteria",
        "SousCompte",
        "LigneCommande",
      ]);
      moteurCree.demarrer();
      setMoteurSync(moteurCree);
    })();
    return () => {
      annule = true;
      moteurCree?.arreter();
    };
  }, [client]);

  // Démarrage : charge la config puis la liste des profils déjà connectés
  // sur cet appareil (section 5, "sélection de profil au démarrage"), et
  // tente une reconnexion silencieuse. DUREE_MINIMALE_CHARGEMENT_MS garantit
  // que le widget de chargement reste visible un minimum, même si tout ceci
  // est instantané (stockage local).
  useEffect(() => {
    const debut = Date.now();
    const attendreDureeMinimale = () =>
      new Promise<void>((resolve) =>
        setTimeout(resolve, Math.max(0, DUREE_MINIMALE_CHARGEMENT_MS - (Date.now() - debut)))
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
    // Timeout : sans lui, un serveur injoignable fait pendre le démarrage
    // jusqu'au timeout TCP (~2 min). En échec, le démarrage retombe sur la
    // sélection de profil au lieu de rester figé.
    const donnees = await Promise.race([
      clientTemporaire.moi(),
      new Promise<never>((_, rejette) =>
        setTimeout(() => rejette(new Error("Serveur injoignable")), 10_000)
      ),
    ]);
    await enregistrerProfil({ utilisateurId: donnees.userId, nom: donnees.nom, role: donnees.role, email });
    await ecrireJetonRafraichissement(donnees.userId, session.refreshToken);
    await ecrireDernierUtilisateur(donnees.userId);
    setUtilisateur(donnees);
    setAccessToken(session.accessToken);
    setEcran("application");
  }

  async function choisirProfil(profil: ProfilEnregistre) {
    if (!configuration) return;
    // Un compte PATRON ne repasse jamais par le jeton mémorisé : sinon, sur
    // un téléphone partagé, n'importe quel employé ouvrirait la session
    // patron sans mot de passe — fuite complète (retour terrain 28/09).
    // Lui, en revanche, peut encore basculer vers un profil employé.
    if (profil.role === Role.PATRON) {
      setEmailPreRempli(profil.email);
      setMessageConnexion("Compte Patron : mot de passe requis pour se reconnecter.");
      setEcran("connexion");
      return;
    }
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
   * cours mais garde le profil enregistré (jeton compris) pour un retour rapide.
   * Réservé au PATRON dans l'UI — les employés passent par seDeconnecter. */
  function changerDeProfil() {
    setAccessToken(null);
    setUtilisateur(null);
    retourSelectionProfil();
  }

  /** "Se déconnecter" (employés) : le profil et son jeton sont oubliés —
   * la reconnexion de CE compte exige le mot de passe. Le patron garde
   * "Changer de profil" (voir EcranPlus). */
  async function seDeconnecter() {
    const id = utilisateur?.userId;
    setAccessToken(null);
    setUtilisateur(null);
    if (id) await oublierProfil(id);
    retourSelectionProfil();
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

  // "chargement" (avant authentification) et "application" (tableau de bord)
  // partagent ce même arbre : l'écran de chargement y reste monté en
  // continu (une simple bascule de visibilité, jamais un nouvel arbre)
  // pendant que le tableau de bord — lourd, navigation + onglets + écrans —
  // monte en arrière-plan. Mesuré sur appareil : les rendre par deux
  // `return` séparés forçait React à démonter tout l'arbre de chargement
  // pour en monter un tout nouveau, laissant voir le fond bleu de la
  // fenêtre le temps que ce nouvel arbre peigne sa première image, même
  // avec une surimpression placée À L'INTÉRIEUR de ce nouvel arbre (elle
  // subissait le même retard que ses voisins).
  //
  // La surimpression couvre TOUTE la phase "chargement" (elle n'a pas de
  // onPret dans ce cas — sinon elle se démonterait ~430 ms après son
  // montage et laisserait l'arbre racine vide jusqu'à la fin de
  // DUREE_MINIMALE_CHARGEMENT_MS : du fond nu sans logo ni spinner). Elle
  // ne devient relevable qu'une fois le contenu applicatif monté — la `key`
  // change alors, la remontant pour que son onLayout → onPret se
  // redéclenche et lève le voile ~430 ms après, le temps que le tableau de
  // bord peigne sa première image réelle en dessous.
  const contenuPret =
    ecran === "application" && client !== null && utilisateur !== null && moteurSync !== null;
  return (
    <View style={styles.racine}>
      {contenuPret && (
        <SafeAreaProvider>
          <FournisseurSession session={{ client, utilisateur, changerDeProfil, seDeconnecter, moteurSync }}>
            <NavigationContainer>
              <CoquilleOnglets />
            </NavigationContainer>
          </FournisseurSession>
          <StatusBar style="dark" />
        </SafeAreaProvider>
      )}
      {(ecran === "chargement" || (ecran === "application" && !applicationPrete)) && (
        <View key={contenuPret ? "application" : "demarrage"} style={StyleSheet.absoluteFill}>
          <EcranChargement onPret={contenuPret ? () => setApplicationPrete(true) : undefined} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1 },
  chargement: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#053483" },
  logoChargement: { width: 140, height: 140 },
  spinnerChargement: { marginTop: 24 },
  texteChargement: { marginTop: 16, color: "#FFFFFF", fontSize: 14 },
});
