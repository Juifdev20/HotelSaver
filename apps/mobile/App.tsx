import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FrontiereErreur } from "./src/composants/FrontiereErreur";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { ActivityIndicator, Image, Linking, StyleSheet, Text, View } from "react-native";
import { ClientApi, ErreurApi, connecterAvecMotDePasse, connecterViaApi, demanderReinitialisationMotDePasse, inscrireHotel, rafraichirSession, rafraichirViaApi } from "@hotel-chicago/api-client";
import { evaluerAcces, ouvrirMiroir, type Miroir } from "@hotel-chicago/miroir-local";
import { ouvrirPersistanceHotel } from "./src/stockage/baseLocale";
import { Role, type InscriptionHotelPayload, type ProfilConnecte } from "@hotel-chicago/types";
import { candidatsApi, lireConfiguration, type ConfigurationApp } from "./src/stockage/configuration";
import {
  ProfilEnregistre,
  avancerHeureMax,
  ecrireContactServeur,
  lireContactServeur,
  identifiantProfil,
  ecrireDernierUtilisateur,
  ecrireJetonRafraichissement,
  enregistrerProfil,
  lireDernierUtilisateur,
  lireProfilCache,
  ecrireProfilCache,
  lireJetonRafraichissement,
  listerProfils,
  oublierProfil,
} from "./src/stockage/profils";
import { EcranSelectionProfil } from "./src/ecrans/EcranSelectionProfil";
import { EcranConnexion } from "./src/ecrans/EcranConnexion";
import { EcranInscription } from "./src/ecrans/EcranInscription";
import { memoriserPayerMaintenant } from "./src/stockage/payerMaintenant";
import { CoquilleOnglets } from "./src/CoquilleOnglets";
import { EcranAbonnementBloque } from "./src/ecrans/EcranAbonnementBloque";
import { FournisseurSession, useSession } from "./src/contexteSession";
import { useSyncEtat } from "./src/hooks/useSyncEtat";
import { FournisseurNotifications } from "./src/notifications/ContexteNotifications";
import { CentreNotifications } from "./src/composants/CentreNotifications";
import { navigationRef } from "./src/notifications/navigationRef";
import { retirerAppareil } from "./src/notifications/push";
import { useVerrouInactivite } from "./src/hooks/useVerrouInactivite";
import { ecouterFonctionNonIncluse } from "./src/fonctions";
import { identifiantAppareil } from "./src/stockage/identifiantAppareil";

type Ecran = "chargement" | "selection-profil" | "connexion" | "inscription" | "application";

/** Durée minimale, comptée depuis le montage JS (donc à peu près depuis le
 * lancement natif), avant de quitter cet écran. Le voile natif (premier
 * écran, logo + slogan — voir withSurfaceTranslucide.js) couvre tout ce qui
 * se passe côté JS pendant ~1500 ms minimum ; sans marge supplémentaire ici,
 * une session déjà valide (vérification quasi instantanée, stockage local)
 * fait passer l'écran de chargement directement au tableau de bord PENDANT
 * qu'il est encore caché sous le voile — l'utilisateur ne le voit alors
 * jamais. 900 ms (réduit de 2500 ms le 01/10/2026 : l attente fixe ralentissait le démarrage de ~2 s) suffit à garder l écran visible un instant une fois le
 * voile retiré, quelle que soit la rapidité de la vérification réelle. */
const DUREE_MINIMALE_CHARGEMENT_MS = 900;

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
      {/* Logo de 128 dp centré : même taille et même place que le splash
       * système et le voile natif (splash_demarrage, MainActivity) — seuls
       * les textes changent d'un écran à l'autre. */}
      <Image source={require("./assets/hotelsaver-logo-carre.png")} style={styles.logoChargement} resizeMode="contain" />
      <View style={styles.sousLogoChargement}>
        <ActivityIndicator color="#FFFFFF" size="large" />
        <Text style={styles.texteChargement}>Veuillez patienter…</Text>
      </View>
    </View>
  );
}

/** 404 sur /auth/me = l'adresse répond mais ce n'est pas le serveur de l'hôtel. */
function messageErreurProfil(erreur: Error): string {
  if (erreur instanceof ErreurApi && erreur.statusCode === 404) {
    return "Le serveur HotelSaver est momentanément indisponible. Réessayez dans un instant.";
  }
  return erreur.message;
}

/** Recharge le profil (`/auth/me`) après chaque cycle de sync réussi (~20 s en
 * ligne) : un réglage hôtel changé par le patron sur un autre appareil —
 * ex. suivi cuisine, « patron opère » — se propage sans relancer l'app. Le
 * rechargement est invisible : `rechargerProfil` ne remplace le profil que
 * s'il a réellement changé (comparaison), donc aucun re-render en temps normal. */
function RafraichisseurProfil() {
  const { rechargerProfil, utilisateur } = useSession();
  const etatSync = useSyncEtat();
  // Une synchronisation réussie prouve que le serveur répond : la durée de grâce hors ligne repart de maintenant, à l'heure du SERVEUR
  // (heure de l'appareil corrigée de l'écart mesuré). Sans cela, avancer l'horloge du téléphone puis la remettre allongeait la grâce.
  const dernierContact = useRef<string | null>(null);
  useEffect(() => {
    const quand = etatSync.derniereSyncReussieLe;
    if (!quand || quand === dernierContact.current) return;
    dernierContact.current = quand;
    void ecrireContactServeur(utilisateur.userId, new Date(Date.now() + (etatSync.decalageHorlogeMs ?? 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etatSync.derniereSyncReussieLe]);
  // Le serveur a refusé une fonction (403 FONCTION_NON_INCLUSE) alors que l'écran se croyait autorisé : le profil est périmé (formule changée
  // ailleurs, profil mémorisé ancien). On le relit pour que les onglets et menus des fonctions fermées disparaissent.
  useEffect(() => ecouterFonctionNonIncluse(() => void rechargerProfil().catch(() => {})), [rechargerProfil]);
  const dernierTraite = useRef<string | null>(null);
  useEffect(() => {
    const horodatage = etatSync.dernierePousseeLe;
    if (!horodatage || horodatage === dernierTraite.current) return;
    dernierTraite.current = horodatage;
    void rechargerProfil().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etatSync.dernierePousseeLe]);
  return null;
}

export default function App() {
  const [configuration, setConfiguration] = useState<ConfigurationApp | null>(null);
  const [profils, setProfils] = useState<ProfilEnregistre[]>([]);
  const [ecran, setEcran] = useState<Ecran>("chargement");
  /** Numéro (ou e-mail d'un ancien compte) à pré-remplir à l'écran de connexion. */
  const [identifiantPreRempli, setIdentifiantPreRempli] = useState<string | undefined>(undefined);
  const [messageConnexion, setMessageConnexion] = useState<string | null>(null);
  const [erreurConnexion, setErreurConnexion] = useState<string | null>(null);
  const [connexionEnCours, setConnexionEnCours] = useState(false);
  const [erreurInscription, setErreurInscription] = useState<string | null>(null);
  const [inscriptionEnCours, setInscriptionEnCours] = useState(false);
  // Session ouverte ? Le jeton d'accès vit dans une référence : il se RENOUVELLE (au démarrage en arrière-plan,
  // puis toutes les 40 min) sans recréer le client ni redémarrer la synchronisation.
  const [sessionActive, setSessionActive] = useState(false);
  const jetonRef = useRef<string | null>(null);
  const renouvellementEnCours = useRef(false);
  /** Démarrage instantané : une requête lancée avant l'arrivée du jeton l'attend (8 s au plus) au lieu d'échouer. */
  const attendreJeton = async (): Promise<string | null> => {
    const limite = Date.now() + 8_000;
    while (jetonRef.current === null && Date.now() < limite) await new Promise((r) => setTimeout(r, 100));
    return jetonRef.current;
  };
  const [utilisateur, setUtilisateur] = useState<ProfilConnecte | null>(null);
  // Abonnement : l'application n'est remplacée par l'écran « abonnement expiré » que si le SERVEUR l'a dit pendant cette ouverture
  // (profil reçu du serveur avec `abonnement.bloque`, ou synchronisation refusée en 402). Un profil mémorisé ancien ne bloque jamais :
  // il peut dater d'avant un paiement fait ailleurs. `profilFraisPour` = l'utilisateur dont le profil vient d'être relu auprès du serveur.
  const [profilFraisPour, setProfilFraisPour] = useState<string | null>(null);
  const [syncBloquee, setSyncBloquee] = useState(false);
  // Entre la fin d'un paiement et la fin de la synchronisation qui suit, on réaffiche l'application sans attendre.
  const [deblocageForce, setDeblocageForce] = useState(false);

  // Lien profond « Ouvrir l'application » du site web (hotelsaver://connexion?telephone=… ou ?email=…) : on
  // garde l'e-mail en attente puis on l'applique dès que l'écran de départ est connu, pour
  // que la logique de démarrage (profils, reconnexion silencieuse) ne l'écrase pas.
  const lienEnAttente = useRef<{ identifiant?: string } | null>(null);
  const [lienRecu, setLienRecu] = useState(0);

  useEffect(() => {
    function traiter(url: string | null) {
      const m = url ? /^hotelsaver:\/\/connexion(?:\?(.*))?$/i.exec(url) : null;
      if (!m) return;
      const parametres = new URLSearchParams(m[1] ?? "");
      lienEnAttente.current = { identifiant: parametres.get("telephone") ?? parametres.get("email") ?? undefined };
      setLienRecu((n) => n + 1);
    }
    void Linking.getInitialURL().then(traiter);
    const abonnement = Linking.addEventListener("url", (evenement) => traiter(evenement.url));
    return () => abonnement.remove();
  }, []);

  useEffect(() => {
    const lien = lienEnAttente.current;
    if (!lien || ecran === "chargement") return;
    lienEnAttente.current = null;
    // Déjà connecté : rien à faire. Sinon : écran de connexion, e-mail pré-rempli.
    if (ecran === "application") return;
    setIdentifiantPreRempli(lien.identifiant);
    setMessageConnexion("Connectez-vous avec le compte que vous venez de créer.");
    setErreurConnexion(null);
    setEcran("connexion");
  }, [lienRecu, ecran]);

  const profilRef = useRef<ProfilConnecte | null>(null);
  profilRef.current = utilisateur;

  // Base locale de l'hôtel (un fichier SQLite PAR hôtel) + client « d'abord sur le téléphone » + moteur de synchronisation. Les écrans
  // lisent et écrivent par ce client : même comportement avec ou sans réseau. Ouverte dès que la session l'est (le profil mémorisé
  // donne l'hôtel, même sans Internet) ; refermée à la fermeture de session ou au changement d'hôtel.
  const [miroir, setMiroir] = useState<Miroir | null>(null);
  const hotelId = utilisateur?.hotelId ?? null;
  useEffect(() => {
    if (!configuration || !sessionActive || !hotelId) {
      setMiroir(null);
      return;
    }
    let annule = false;
    let ouvert: Miroir | null = null;
    (async () => {
      const m = await ouvrirMiroir({
        persistance: await ouvrirPersistanceHotel(hotelId),
        baseUrl: candidatsApi(),
        getAccessToken: () => jetonRef.current ?? attendreJeton(),
        utilisateur: () => profilRef.current!,
      });
      if (annule) {
        m.fermer();
        return;
      }
      ouvert = m;
      m.moteur.demarrer();
      setMiroir(m);
    })().catch((e) => console.warn("Base locale indisponible :", e));
    return () => {
      annule = true;
      ouvert?.fermer();
      setMiroir(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuration, sessionActive, hotelId]);
  const client = miroir ? miroir.client : null;
  const moteurSync = miroir ? miroir.moteur : null;

  // Le moteur de synchronisation voit le refus « abonnement expiré » (HTTP 402) avant tout autre : on ne retient que ce booléen
  // (pas l'état entier) pour ne pas redessiner toute l'application à chaque cycle.
  useEffect(() => {
    if (!moteurSync) {
      setSyncBloquee(false);
      return;
    }
    return moteurSync.onChangement((etat) => setSyncBloquee(etat.abonnementBloque === true));
  }, [moteurSync]);

  useEffect(() => {
    if (!sessionActive) {
      setProfilFraisPour(null);
      setDeblocageForce(false);
    }
  }, [sessionActive]);

  const abonnementBloque =
    !deblocageForce && (syncBloquee || (utilisateur !== null && profilFraisPour === utilisateur.userId && utilisateur.abonnement?.bloque === true));

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
      // Jamais pour un PATRON : ce compte exige le mot de passe partout,
      // y compris ici — sinon un redémarrage de l'app ouvrirait sa session
      // sur un téléphone entre des mains d'employés (retour terrain 28/09).
      const dernierId = liste.length === 1 ? liste[0].utilisateurId : await lireDernierUtilisateur();
      const profil = liste.find((p) => p.utilisateurId === dernierId);
      if (profil && profil.role !== Role.PATRON) {
        const jeton = await lireJetonRafraichissement(profil.utilisateurId);
        const cache = jeton ? await lireProfilCache(profil.utilisateurId) : null;
        // Durée de grâce hors ligne (14 jours depuis le dernier contact avec le serveur, horloge qui ne recule jamais) : au-delà,
        // ou si la licence était suspendue, le téléphone doit retrouver Internet avant de rouvrir la session.
        const contact = await lireContactServeur(profil.utilisateurId);
        const acces =
          jeton && cache
            ? evaluerAcces({ profil: cache, verifieLe: contact?.verifieLe ?? new Date().toISOString(), heureMax: contact?.heureMax ?? new Date().toISOString() }, new Date())
            : null;
        if (acces && !acces.autorise) {
          await attendreDureeMinimale();
          setIdentifiantPreRempli(identifiantProfil(profil));
          setMessageConnexion(acces.message);
          setEcran("connexion");
          return;
        }
        if (!contact) await ecrireContactServeur(profil.utilisateurId); // première ouverture depuis cette mise à jour : la grâce démarre maintenant
        else await avancerHeureMax(profil.utilisateurId);
        if (jeton && cache) {
          // DÉMARRAGE INSTANTANÉ : l'application s'ouvre tout de suite sur les données enregistrées dans le
          // téléphone (profil en copie locale, base locale) ; le jeton et le profil sont renouvelés en arrière-plan.
          // Hors ligne, on travaille quand même (c'est le principe de l'application) et on réessaie toutes les 30 s.
          await attendreDureeMinimale();
          setUtilisateur(cache);
          setSessionActive(true);
          setEcran("application");
          void renouvelerEnArrierePlan(config, profil.utilisateurId, true);
          return;
        }
        if (jeton) {
          try {
            // Le renouvellement de session et la durée minimale d'affichage courent EN MÊME TEMPS
            // (avant : l'un après l'autre, donc leurs durées s'additionnaient).
            const [session] = await Promise.all([
              rafraichir(config, jeton),
              attendreDureeMinimale(),
            ]);
            await terminerConnexion(session, config, identifiantProfil(profil));
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

  /** `identifiant` : numéro « +243… » (ou e-mail d'un ancien compte) mémorisé avec le profil pour pré-remplir la prochaine connexion. */
  async function terminerConnexion(session: { accessToken: string; refreshToken: string }, config: ConfigurationApp, identifiant?: string) {
    const clientTemporaire = new ClientApi(candidatsApi(), () => session.accessToken);
    // Timeout : sans lui, un serveur injoignable fait pendre le démarrage
    // jusqu'au timeout TCP (~2 min). En échec, le démarrage retombe sur la
    // sélection de profil au lieu de rester figé.
    const donnees = await Promise.race([
      clientTemporaire.moi(),
      new Promise<never>((_, rejette) =>
        setTimeout(() => rejette(new Error("Serveur injoignable")), 6_000)
      ),
    ]);
    await enregistrerProfil({
      utilisateurId: donnees.userId,
      nom: donnees.nom,
      role: donnees.role,
      ...(identifiant?.includes("@") ? { email: identifiant } : { telephone: identifiant }),
    });
    await ecrireJetonRafraichissement(donnees.userId, session.refreshToken);
    await ecrireDernierUtilisateur(donnees.userId);
    await ecrireProfilCache(donnees.userId, donnees);
    await ecrireContactServeur(donnees.userId);
    jetonRef.current = session.accessToken;
    setUtilisateur(donnees);
    setProfilFraisPour(donnees.userId);
    setSessionActive(true);
    setEcran("application");
  }

  /**
   * Renouvelle le jeton d'accès avec le jeton de rafraîchissement mémorisé. Renvoie « ok », « hors-ligne »
   * (réessayer plus tard) ou « expiree » (reconnexion nécessaire). Jamais deux renouvellements en même temps :
   * un jeton de rafraîchissement ne sert qu'une fois, un doublon ferait croire à une session expirée.
   */
  async function renouvelerJeton(config: ConfigurationApp, utilisateurId: string): Promise<"ok" | "hors-ligne" | "expiree" | "en-cours"> {
    if (renouvellementEnCours.current) return "en-cours";
    renouvellementEnCours.current = true;
    try {
      const jeton = await lireJetonRafraichissement(utilisateurId);
      if (!jeton) return "expiree";
      const session = await rafraichir(config, jeton);
      jetonRef.current = session.accessToken;
      await ecrireJetonRafraichissement(utilisateurId, session.refreshToken);
      await ecrireContactServeur(utilisateurId);
      return "ok";
    } catch (erreur) {
      return erreur instanceof Error && erreur.message.startsWith("Impossible de joindre") ? "hors-ligne" : "expiree";
    } finally {
      renouvellementEnCours.current = false;
    }
  }

  /** Session irrécupérable (refus du serveur) : retour à la sélection de profil, comme une déconnexion. */
  function sessionExpiree() {
    jetonRef.current = null;
    setSessionActive(false);
    setUtilisateur(null);
    retourSelectionProfil();
  }

  /** Après un démarrage instantané : renouvelle le jeton puis rafraîchit le profil (nom, hôtel, réglages…). */
  async function renouvelerEnArrierePlan(config: ConfigurationApp, utilisateurId: string, rafraichirProfil: boolean) {
    const etat = await renouvelerJeton(config, utilisateurId);
    if (etat === "expiree") return sessionExpiree();
    if (etat !== "ok" || !rafraichirProfil) return;
    try {
      const frais = await new ClientApi(candidatsApi(), () => jetonRef.current).moi();
      await ecrireProfilCache(frais.userId, frais);
      setUtilisateur((courant) => (courant && courant.userId === frais.userId ? frais : courant));
      setProfilFraisPour(frais.userId);
    } catch {
      // Profil non rafraîchi : la copie locale reste utilisée, on réessaiera au prochain démarrage.
    }
  }

  /** Profil relu DIRECTEMENT auprès du serveur : jamais la copie en cache du client « d'abord sur le téléphone » (valable 20 s), qui
   * pourrait encore dire « abonnement bloqué » juste après un paiement. */
  function lireProfilServeur(): Promise<ProfilConnecte> {
    return new ClientApi(candidatsApi(), () => jetonRef.current).moi();
  }

  /** Un paiement d'abonnement vient d'être confirmé : profil à jour (mémorisé), application réaffichée SANS redémarrage si elle était
   * bloquée, puis synchronisation forcée pour envoyer les actions restées en file. Échoue (et l'écran propose de réessayer) si le
   * serveur n'est pas joignable. */
  async function apresRenouvellement() {
    const courant = profilRef.current;
    const moteur = moteurSync;
    if (!courant) return;
    const frais = await lireProfilServeur();
    if (frais.userId !== courant.userId) return;
    await ecrireProfilCache(frais.userId, frais);
    setUtilisateur((u) => (u && u.userId === frais.userId ? frais : u));
    setProfilFraisPour(frais.userId);
    if (frais.abonnement?.bloque) throw new Error("L'abonnement n'est pas encore actif. Patientez un instant puis réessayez.");
    if (!moteur) return;
    setDeblocageForce(true);
    void (async () => {
      try {
        await moteur.forcerSynchronisation();
        // Un cycle déjà en cours avant le paiement peut avoir fini sur un refus : on en relance un.
        if (moteur.etatActuel().abonnementBloque) await moteur.forcerSynchronisation();
      } catch {
        // La synchronisation réessaiera seule.
      } finally {
        setDeblocageForce(false);
      }
    })();
  }

  // Tant que la session est ouverte : renouvellement toutes les 40 min (le jeton d'accès vit ~1 h) ; si le jeton
  // n'a pas pu être obtenu (téléphone hors ligne au démarrage), nouvelle tentative toutes les 30 s.
  useEffect(() => {
    if (!sessionActive || !utilisateur || !configuration) return;
    const config = configuration;
    const utilisateurId = utilisateur.userId;
    let arrete = false;
    let minuteur: ReturnType<typeof setTimeout>;
    const planifier = () => {
      minuteur = setTimeout(async () => {
        const avait = jetonRef.current !== null;
        const etat = await renouvelerJeton(config, utilisateurId);
        if (arrete) return;
        if (etat === "expiree") return sessionExpiree();
        if (etat === "ok" && !avait) void renouvelerEnArrierePlan(config, utilisateurId, true);
        planifier();
      }, jetonRef.current ? 40 * 60_000 : 30_000);
    };
    planifier();
    return () => {
      arrete = true;
      clearTimeout(minuteur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionActive, utilisateur?.userId, configuration]);

  async function choisirProfil(profil: ProfilEnregistre) {
    if (!configuration) return;
    // Chacun garde son compte : choisir un profil exige TOUJOURS son mot de
    // passe, jamais le jeton mémorisé — sinon un réceptionniste ouvrirait le
    // compte cafétaria (ou le patron) en un tap sur le téléphone partagé
    // (retour terrain 28/09). Le patron circule quand même : il connaît les
    // identifiants de chaque compte puisque c'est lui qui les crée.
    setIdentifiantPreRempli(identifiantProfil(profil));
    setMessageConnexion("Entrez le mot de passe de ce compte pour continuer.");
    setEcran("connexion");
  }

  /** Connexion/renouvellement : préfère le relais API local (le téléphone
   * n'a besoin que du LAN, le serveur parle à Supabase à sa place) ; en
   * secours — relais absent sur une vieille API (404) — appel direct
   * Supabase qui exige l'Internet. */
  async function connecter(config: ConfigurationApp, identifiant: string, motDePasse: string) {
    try {
      return await connecterViaApi(candidatsApi(), identifiant, motDePasse);
    } catch (e) {
      if (e instanceof ErreurApi && e.statusCode === 404) {
        // Le secours direct Supabase ne connaît que l'e-mail : la traduction
        // numéro → compte se fait sur le serveur (connexion par numéro, 15/10/2026).
        if (!identifiant.includes("@")) throw new Error("Le serveur HotelSaver doit être mis à jour pour la connexion par numéro.");
        return connecterAvecMotDePasse({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey }, identifiant, motDePasse);
      }
      throw e;
    }
  }

  async function rafraichir(config: ConfigurationApp, jetonRafraichissement: string) {
    try {
      return await rafraichirViaApi(candidatsApi(), jetonRafraichissement);
    } catch (e) {
      if (e instanceof ErreurApi && e.statusCode === 404) {
        return rafraichirSession({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey }, jetonRafraichissement);
      }
      throw e;
    }
  }

  async function seConnecter(identifiant: string, motDePasse: string) {
    if (!configuration) return;
    setErreurConnexion(null);
    setConnexionEnCours(true);
    try {
      const session = await connecter(configuration, identifiant, motDePasse);
      await terminerConnexion(session, configuration, identifiant);
    } catch (erreur) {
      setErreurConnexion(erreur instanceof Error ? messageErreurProfil(erreur) : "Erreur de connexion.");
    } finally {
      setConnexionEnCours(false);
    }
  }

  async function sInscrire(dto: InscriptionHotelPayload, payerMaintenant: boolean) {
    if (!configuration) return;
    setErreurInscription(null);
    setInscriptionEnCours(true);
    try {
      await inscrireHotel({ url: candidatsApi(), appareil: await identifiantAppareil() }, dto);
      if (payerMaintenant) await memoriserPayerMaintenant();
      try {
        // Connexion immédiate avec le numéro (compte confirmé d'office depuis
        // le 15/10/2026). Un échec ici n'est pas un échec d'inscription —
        // l'hôtel existe bel et bien — donc jamais l'erreur brute de connexion.
        const session = await connecter(configuration, dto.telephoneProprietaire, dto.motDePasse);
        await terminerConnexion(session, configuration, dto.telephoneProprietaire);
      } catch {
        setIdentifiantPreRempli(dto.telephoneProprietaire);
        setMessageConnexion("Compte créé ! Connectez-vous avec votre numéro et votre mot de passe.");
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
    setIdentifiantPreRempli(undefined);
    setEcran(liste.length > 0 ? "selection-profil" : "connexion");
  }

  /** "Changer de profil" depuis le tableau de bord : referme la session en
   * cours mais garde le profil enregistré (jeton compris) pour un retour rapide.
   * Réservé au PATRON dans l'UI — les employés passent par seDeconnecter. */
  function changerDeProfil() {
    void retirerAppareil(client);
    jetonRef.current = null;
    setSessionActive(false);
    setUtilisateur(null);
    retourSelectionProfil();
  }

  /** "Se déconnecter" (employés) : le profil et son jeton sont oubliés —
   * la reconnexion de CE compte exige le mot de passe. Le patron garde
   * "Changer de profil" (voir EcranPlus). */
  async function seDeconnecter() {
    const id = utilisateur?.userId;
    await retirerAppareil(client);
    jetonRef.current = null;
    setSessionActive(false);
    setUtilisateur(null);
    if (id) await oublierProfil(id);
    retourSelectionProfil();
  }

  /** « Effacer les données de cet appareil » : copie locale de l'hôtel, comptes mémorisés et jetons. Les actions non envoyées sont perdues
   * (l'écran de réglages prévient avant). */
  async function effacerDonneesAppareil() {
    await retirerAppareil(client);
    jetonRef.current = null;
    setSessionActive(false);
    await miroir?.magasin.effacerTout().catch(() => {});
    for (const p of await listerProfils()) await oublierProfil(p.utilisateurId);
    setUtilisateur(null);
    retourSelectionProfil();
  }

  // Verrou d'inactivité facultatif (réglage « Sécurité », désactivé par défaut) : seul le patron peut avoir un profil à retrouver ;
  // pour les employés, le retour à l'écran de profils redemande de toute façon le mot de passe.
  useVerrouInactivite(sessionActive && utilisateur !== null, changerDeProfil);

  if (ecran === "selection-profil") {
    return (
      <EcranSelectionProfil
        profils={profils}
        onChoisir={choisirProfil}
        onAjouterCompte={() => {
          setIdentifiantPreRempli(undefined);
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
        identifiantInitial={identifiantPreRempli}
        message={messageConnexion}
        erreur={erreurConnexion}
        enCours={connexionEnCours}
        onConnexion={seConnecter}
        onMotDePasseOublie={async (identifiant) => {
          if (!configuration) throw new Error("Application pas encore configurée.");
          await demanderReinitialisationMotDePasse({ url: candidatsApi() }, identifiant);
        }}
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
    ecran === "application" && client !== null && utilisateur !== null && moteurSync !== null && miroir !== null;
  return (
    <View style={styles.racine}>
      {contenuPret && (
        <SafeAreaProvider>
          <FrontiereErreur>
          <FournisseurSession session={{ client, utilisateur, changerDeProfil, seDeconnecter, effacerDonneesAppareil, moteurSync, miroir: miroir!, apresRenouvellement, rechargerProfil: async () => {
            // Relecture auprès du serveur d'abord (le profil sert aussi à décider du blocage d'abonnement) ; hors ligne, la copie en cache.
            let serveur = true;
            let frais: ProfilConnecte;
            try {
              frais = await lireProfilServeur();
            } catch {
              serveur = false;
              frais = await client.moi();
            }
            if (frais.userId !== utilisateur.userId) return;
            await ecrireProfilCache(frais.userId, frais);
            setUtilisateur((courant) => (courant && JSON.stringify(courant) === JSON.stringify(frais) ? courant : frais));
            if (serveur) setProfilFraisPour(frais.userId);
          } }}>
            <RafraichisseurProfil />
            {abonnementBloque ? (
              // Abonnement expiré : l'écran de renouvellement REMPLACE l'application (la base locale et la synchronisation restent actives,
              // rien n'est perdu). Il disparaît tout seul dès que le serveur confirme l'abonnement.
              <EcranAbonnementBloque onContinuer={apresRenouvellement} />
            ) : (
              <FournisseurNotifications client={client} role={utilisateur.role} fonctions={utilisateur.fonctions}>
                <NavigationContainer ref={navigationRef}>
                  <CoquilleOnglets />
                </NavigationContainer>
                <CentreNotifications />
              </FournisseurNotifications>
            )}
          </FournisseurSession>
          </FrontiereErreur>
          <StatusBar style="light" />
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
  logoChargement: { width: 128, height: 128 },
  sousLogoChargement: { position: "absolute", top: "50%", left: 0, right: 0, marginTop: 64 + 24, alignItems: "center" },
  texteChargement: { marginTop: 16, color: "#FFFFFF", fontSize: 14 },
});
