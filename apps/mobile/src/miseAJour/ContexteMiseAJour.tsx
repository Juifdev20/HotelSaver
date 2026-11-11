import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState } from "react-native";
import * as Notifications from "expo-notifications";
import type { MiseAJourDisponible } from "@hotel-chicago/regles";
import { apkPret, installerApk, memoriserAnnonce, miseAJourPossible, nettoyerAnciennesMisesAJour, telechargerApk, verifierMiseAJour, versionDejaAnnoncee, versionInstallee } from "./service";

export type EtatMiseAJour = "inconnu" | "verification" | "a-jour" | "disponible" | "telechargement" | "prete" | "erreur";

interface ValeurMiseAJour {
  /** Seul Android sait se mettre à jour de cette façon (l'APK est publié sur GitHub). */
  possible: boolean;
  etat: EtatMiseAJour;
  maj: MiseAJourDisponible | null;
  /** 0-100 pendant le téléchargement. */
  progres: number;
  erreur: string | null;
  versionInstallee: string;
  derniereVerification: Date | null;
  /** `manuel` : l'utilisateur a touché « Vérifier » — l'échec est alors expliqué, au lieu d'être silencieux. */
  verifier: (manuel?: boolean) => Promise<void>;
  telecharger: () => Promise<void>;
  installer: () => Promise<void>;
}

const Ctx = createContext<ValeurMiseAJour | null>(null);

const INTERVALLE_VERIFICATION_MS = 3 * 3_600_000;
const CANAL = "mise_a_jour";

/** Notification locale (visible aussi écran verrouillé) qui ouvre l'écran « Mise à jour » au toucher. */
async function annoncer(titre: string, corps: string): Promise<void> {
  try {
    const droit = await Notifications.getPermissionsAsync();
    if (!droit.granted) return;
    await Notifications.setNotificationChannelAsync(CANAL, { name: "Mises à jour de l'application", importance: Notifications.AndroidImportance.DEFAULT });
    await Notifications.scheduleNotificationAsync({
      content: { title: titre, body: corps, data: { ecran: "mise-a-jour", type: "MISE_A_JOUR" } },
      trigger: { channelId: CANAL },
    });
  } catch {
    // Sans notification, la bannière et l'écran « Mise à jour » préviennent quand même.
  }
}

/**
 * Cherche une nouvelle version au démarrage, au retour dans l'application (au plus toutes les 3 h) et à la demande. Quand elle existe : une notification
 * et une bannière préviennent ; « Télécharger » l'amène en arrière-plan avec sa progression ; une fois prête, on propose d'installer maintenant ou plus tard
 * (le fichier reste prêt : le bouton de l'écran « Mise à jour » permet de l'installer quand on veut).
 */
export function FournisseurMiseAJour({ children }: { children: React.ReactNode }) {
  const [etat, setEtat] = useState<EtatMiseAJour>("inconnu");
  const [maj, setMaj] = useState<MiseAJourDisponible | null>(null);
  const [progres, setProgres] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [derniere, setDerniere] = useState<Date | null>(null);
  const apk = useRef<string | null>(null);
  const occupe = useRef(false);
  const majRef = useRef<MiseAJourDisponible | null>(null);
  majRef.current = maj;

  const verifier = useCallback(async (manuel = false) => {
    if (!miseAJourPossible || occupe.current) return;
    occupe.current = true;
    if (manuel) {
      setErreur(null);
      setEtat((e) => (e === "disponible" || e === "prete" ? e : "verification"));
    }
    try {
      const trouvee = await verifierMiseAJour();
      setDerniere(new Date());
      if (!trouvee) {
        setMaj(null);
        setEtat("a-jour");
        void nettoyerAnciennesMisesAJour();
        return;
      }
      setMaj(trouvee);
      const deja = await apkPret(trouvee);
      apk.current = deja;
      setProgres(deja ? 100 : 0);
      setEtat(deja ? "prete" : "disponible");
      if ((await versionDejaAnnoncee()) !== trouvee.version) {
        await memoriserAnnonce(trouvee.version);
        void annoncer("Nouvelle version de HotelSaver", `La version ${trouvee.version} est disponible. Touchez pour la télécharger.`);
      }
    } catch {
      if (manuel) {
        setErreur("Impossible de vérifier pour le moment. Vérifiez la connexion Internet puis réessayez.");
        setEtat((e) => (e === "verification" ? "erreur" : e));
      } else setEtat((e) => (e === "verification" ? "inconnu" : e));
    } finally {
      occupe.current = false;
    }
  }, []);

  const installer = useCallback(async () => {
    const uri = apk.current;
    if (!uri) return;
    try {
      await installerApk(uri);
    } catch {
      setErreur("L'installation n'a pas pu s'ouvrir. Réessayez, ou téléchargez la dernière version depuis le site.");
    }
  }, []);

  const telecharger = useCallback(async () => {
    const cible = majRef.current;
    if (!cible || occupe.current) return;
    occupe.current = true;
    setErreur(null);
    setProgres(0);
    setEtat("telechargement");
    try {
      apk.current = await telechargerApk(cible, setProgres);
      setEtat("prete");
      if (AppState.currentState === "active") {
        Alert.alert(
          "Mise à jour prête",
          `La version ${cible.version} est téléchargée. Voulez-vous l'installer maintenant ? L'application va se fermer puis se rouvrir à jour.`,
          [
            { text: "Plus tard", style: "cancel" },
            { text: "Installer maintenant", onPress: () => void installer() },
          ]
        );
      } else {
        void annoncer("Mise à jour prête", "Ouvrez HotelSaver pour installer la nouvelle version.");
      }
    } catch (e) {
      setErreur(e instanceof Error && /incomplet/.test(e.message) ? e.message : "Le téléchargement s'est interrompu. Il reprendra là où il s'est arrêté : touchez « Télécharger » de nouveau.");
      setEtat("erreur");
    } finally {
      occupe.current = false;
    }
  }, [installer]);

  useEffect(() => {
    if (!miseAJourPossible) return;
    const depart = setTimeout(() => void verifier(), 4000);
    const minuteur = setInterval(() => void verifier(), INTERVALLE_VERIFICATION_MS);
    let derniereActivite = Date.now();
    const abonnement = AppState.addEventListener("change", (s) => {
      if (s === "active" && Date.now() - derniereActivite > INTERVALLE_VERIFICATION_MS) void verifier();
      derniereActivite = Date.now();
    });
    return () => {
      clearTimeout(depart);
      clearInterval(minuteur);
      abonnement.remove();
    };
  }, [verifier]);

  const valeur = useMemo<ValeurMiseAJour>(
    () => ({ possible: miseAJourPossible, etat, maj, progres, erreur, versionInstallee: versionInstallee(), derniereVerification: derniere, verifier, telecharger, installer }),
    [etat, maj, progres, erreur, derniere, verifier, telecharger, installer]
  );
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useMiseAJour(): ValeurMiseAJour {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMiseAJour doit être utilisé sous <FournisseurMiseAJour>.");
  return v;
}
