import approvisionner from "./assets/sons/approvisionner.mp3";
import pleaseTryAgain from "./assets/sons/please_try_again.mp3";
import stockBas from "./assets/sons/stock_bas.mp3";
import stockBasDebut from "./assets/sons/stock_bas_debut.mp3";
import stockEpuise from "./assets/sons/stock_epuise.mp3";
import stockEpuiseDebut from "./assets/sons/stock_epuise_debut.mp3";

/**
 * Tout ce que le poste dit ou fait sonner : le BIP d'un scan (généré, aucun fichier) et la VOIX — phrases enregistrées d'une même voix de femme
 * (Delphine : français, et « Please try again » en anglais), identiques sur tous les postes et sans connexion ; seul le nom du produit d'une alerte de
 * stock est lu par la voix de Windows. Le son suit le volume de Windows ; chacun se coupe dans Paramètres › Sons et voix. Un son ne doit jamais faire
 * échouer un scan : tout est silencieux en cas de problème.
 */

export interface PreferencesSons {
  bip: boolean;
  voix: boolean;
}

const CLE = "hotel-chicago:sons";

export function preferencesSons(): PreferencesSons {
  try {
    const lu = JSON.parse(localStorage.getItem(CLE) || "{}");
    return { bip: lu.bip !== false, voix: lu.voix !== false };
  } catch {
    return { bip: true, voix: true };
  }
}

export function ecrirePreferencesSons(partielles: Partial<PreferencesSons>): PreferencesSons {
  const suivantes = { ...preferencesSons(), ...partielles };
  try {
    localStorage.setItem(CLE, JSON.stringify(suivantes));
  } catch {
    // Le réglage vaut jusqu'à la fermeture de la fenêtre.
  }
  return suivantes;
}

const FICHIERS = {
  please_try_again: pleaseTryAgain,
  stock_bas_debut: stockBasDebut,
  stock_epuise_debut: stockEpuiseDebut,
  approvisionner,
  stock_bas: stockBas,
  stock_epuise: stockEpuise,
} as const;

type Son = keyof typeof FICHIERS;
type Partie = Son | { texte: string };

let contexteAudio: AudioContext | null = null;

/** Bip court généré (WebAudio) : aigu = article lu, grave = scan raté. */
export function bipSimple(type: "ok" | "erreur"): void {
  if (!preferencesSons().bip) return;
  try {
    contexteAudio ??= new AudioContext();
    if (contexteAudio.state === "suspended") void contexteAudio.resume();
    const oscillateur = contexteAudio.createOscillator();
    const volume = contexteAudio.createGain();
    oscillateur.type = "square";
    oscillateur.frequency.value = type === "ok" ? 1800 : 300;
    volume.gain.value = 0.3;
    oscillateur.connect(volume).connect(contexteAudio.destination);
    const debut = contexteAudio.currentTime;
    oscillateur.start(debut);
    oscillateur.stop(debut + (type === "ok" ? 0.11 : 0.3));
  } catch {
    /* pas de son disponible : le message à l'écran suffit */
  }
}

function jouer(son: Son): Promise<void> {
  return new Promise((resolve) => {
    try {
      const element = new Audio(FICHIERS[son]);
      const garde = setTimeout(resolve, 7000);
      const fin = () => {
        clearTimeout(garde);
        resolve();
      };
      element.onended = fin;
      element.onerror = fin;
      void element.play().catch(fin);
    } catch {
      resolve();
    }
  });
}

function lire(texte: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (!("speechSynthesis" in window)) return resolve();
      const u = new SpeechSynthesisUtterance(texte);
      u.lang = "fr-FR";
      const voix = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("fr"));
      // Une voix française de femme quand Windows en a une (Microsoft Hortense, Julie…) ; sinon la première voix française.
      const femme = voix.find((v) => /hortense|julie|denise|eloise|female|femme/i.test(v.name));
      if (femme || voix[0]) u.voice = (femme || voix[0])!;
      const garde = setTimeout(resolve, 8000);
      u.onend = u.onerror = () => {
        clearTimeout(garde);
        resolve();
      };
      window.speechSynthesis.speak(u);
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
      for (const p of parties) {
        if (typeof p === "string") await jouer(p);
        else await lire(p.texte);
      }
    })
    .catch(() => undefined);
}

let derniereVoixEchec = 0;

/** Un scan raté : son grave + « Please try again » (pas plus d'une fois toutes les 2,5 s : une douchette peut répéter). */
export function signalErreur(): void {
  bipSimple("erreur");
  const maintenant = Date.now();
  if (maintenant - derniereVoixEchec < 2500) return;
  derniereVoixEchec = maintenant;
  dire("please_try_again");
}

/** « Attention, stock bas : <produit>. Pensez à vous approvisionner. » — sans nom, la phrase complète enregistrée. */
export function annoncerStock(produit: string | undefined, epuise: boolean): void {
  const nom = produit?.trim();
  if (!nom) return dire(epuise ? "stock_epuise" : "stock_bas");
  dire(epuise ? "stock_epuise_debut" : "stock_bas_debut", { texte: nom }, "approvisionner");
}

export function ecouterExemple(): void {
  derniereVoixEchec = 0;
  dire("please_try_again");
}
