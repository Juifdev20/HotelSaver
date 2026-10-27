import { Vibration } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as Speech from "expo-speech";

/**
 * Tout ce que l'application dit ou fait sonner :
 *  - le BIP (court fichier) à chaque article scanné, un son grave quand le scan échoue ;
 *  - la VOIX : des phrases enregistrées d'une même voix de femme (Delphine : français, et « Please try again » en anglais), identiques sur tous les
 *    téléphones, sans connexion. Seul le nom du produit d'une alerte de stock est lu par la voix du téléphone (on ne peut pas l'enregistrer).
 * Le bip et la voix suivent le volume MÉDIA du téléphone ; chacun se coupe dans Plus › Sons et voix. Un son ne doit jamais faire échouer
 * un scan ou une vente : tout est silencieux en cas de problème.
 */

export interface PreferencesSons {
  bip: boolean;
  voix: boolean;
}

const CLE = "hotel-chicago:sons";
let preferences: PreferencesSons = { bip: true, voix: true };
let chargees = false;

export async function chargerPreferencesSons(): Promise<PreferencesSons> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    const lu = brut ? JSON.parse(brut) : {};
    preferences = { bip: lu.bip !== false, voix: lu.voix !== false };
  } catch {
    preferences = { bip: true, voix: true };
  }
  chargees = true;
  return preferences;
}

export function preferencesSons(): PreferencesSons {
  if (!chargees) void chargerPreferencesSons();
  return preferences;
}

export async function ecrirePreferencesSons(partielles: Partial<PreferencesSons>): Promise<PreferencesSons> {
  preferences = { ...preferences, ...partielles };
  chargees = true;
  try {
    await AsyncStorage.setItem(CLE, JSON.stringify(preferences));
  } catch {
    // Le réglage vaut pour cette session ; il sera redemandé au prochain lancement.
  }
  return preferences;
}

const FICHIERS = {
  bip: require("../../assets/sons/bip.wav"),
  bip_erreur: require("../../assets/sons/bip_erreur.wav"),
  please_try_again: require("../../assets/sons/please_try_again.mp3"),
  stock_bas_debut: require("../../assets/sons/stock_bas_debut.mp3"),
  stock_epuise_debut: require("../../assets/sons/stock_epuise_debut.mp3"),
  approvisionner: require("../../assets/sons/approvisionner.mp3"),
  stock_bas: require("../../assets/sons/stock_bas.mp3"),
  stock_epuise: require("../../assets/sons/stock_epuise.mp3"),
} as const;

export type Son = keyof typeof FICHIERS;
type Partie = Son | { texte: string };

const lecteurs = new Map<Son, AudioPlayer>();
let modeAudioPrepare = false;

async function preparerAudio(): Promise<void> {
  if (modeAudioPrepare) return;
  modeAudioPrepare = true;
  try {
    // Le son passe même si le téléphone est en mode silencieux (iOS) ; il suit le volume média.
    await setAudioModeAsync({ playsInSilentMode: true });
  } catch {
    // Mode par défaut : le son passe quand même.
  }
}

/** Joue un fichier et rend la main à la fin (ou après `delaiMax`, pour ne jamais bloquer la file). */
function jouer(son: Son, delaiMax = 7000): Promise<void> {
  return new Promise((resolve) => {
    try {
      let lecteur = lecteurs.get(son);
      if (!lecteur) {
        lecteur = createAudioPlayer(FICHIERS[son]);
        lecteurs.set(son, lecteur);
      }
      const joueur = lecteur;
      let fini = false;
      const terminer = () => {
        if (fini) return;
        fini = true;
        clearTimeout(garde);
        abonnement.remove();
        resolve();
      };
      const garde = setTimeout(terminer, delaiMax);
      const abonnement = joueur.addListener("playbackStatusUpdate", (statut) => {
        if (statut.didJustFinish) terminer();
      });
      joueur.volume = 1;
      void Promise.resolve(joueur.seekTo(0)).catch(() => undefined).then(() => joueur.play());
    } catch {
      resolve();
    }
  });
}

function lire(texte: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const garde = setTimeout(resolve, 8000);
      const fin = () => {
        clearTimeout(garde);
        resolve();
      };
      Speech.speak(texte, { language: "fr-FR", rate: 1, onDone: fin, onStopped: fin, onError: fin });
    } catch {
      resolve();
    }
  });
}

let file: Promise<void> = Promise.resolve();

/** Dit les parties l'une après l'autre (fichiers et texte), sans jamais parler par-dessus une annonce en cours. */
function dire(...parties: Partie[]): void {
  if (!preferencesSons().voix) return;
  file = file
    .then(async () => {
      await preparerAudio();
      for (const p of parties) {
        if (typeof p === "string") await jouer(p);
        else await lire(p.texte);
      }
    })
    .catch(() => undefined);
}

/** Court bip aigu : un article lu. */
function bip(): void {
  if (!preferencesSons().bip) return;
  void preparerAudio().then(() => jouer("bip", 1500));
}

const VIBRATION_OK = 40;
const VIBRATION_ERREUR = [0, 80, 60, 80];
let derniereVoixEchec = 0;

/** Un scan réussi : bip + courte vibration. */
export function signalOk(): void {
  Vibration.vibrate(VIBRATION_OK);
  bip();
}

/**
 * Un scan qui n'a pas marché (code inconnu, article refusé) : son grave + « Please try again ». La caméra lit des dizaines d'images par
 * seconde : la voix n'est pas répétée plus d'une fois toutes les 2,5 s.
 */
export function signalErreur(): void {
  Vibration.vibrate(VIBRATION_ERREUR);
  if (preferencesSons().bip) void preparerAudio().then(() => jouer("bip_erreur", 1500));
  const maintenant = Date.now();
  if (maintenant - derniereVoixEchec < 2500) return;
  derniereVoixEchec = maintenant;
  dire("please_try_again");
}

/**
 * « Attention, stock bas : <produit>. Pensez à vous approvisionner. » — la phrase enregistrée, le nom du produit lu par le téléphone, puis le
 * conseil. Sans nom : la phrase complète enregistrée.
 */
export function annoncerStock(produit: string | undefined, epuise: boolean): void {
  const nom = produit?.trim();
  if (!nom) return dire(epuise ? "stock_epuise" : "stock_bas");
  dire(epuise ? "stock_epuise_debut" : "stock_bas_debut", { texte: nom }, "approvisionner");
}

/** Écoute d'un exemple, depuis Plus › Sons et voix. */
export function ecouterExemple(): void {
  derniereVoixEchec = 0;
  dire("please_try_again");
}
