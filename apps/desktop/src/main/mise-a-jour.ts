import { app } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import { notesLisibles } from "@hotel-chicago/regles";

/**
 * Mises à jour du bureau (11/11/2026). L'installateur publié sur GitHub est aussi le « serveur de mises à jour » : à chaque release, electron-builder produit
 * `latest.yml` (version, fichier, empreinte), publié avec l'installateur. L'application le lit, télécharge la nouvelle version EN ARRIÈRE-PLAN (avec la
 * progression) quand l'utilisateur le demande, puis propose « Redémarrer maintenant » ou « Plus tard » : plus tard, la mise à jour s'installe toute seule à
 * la fermeture de l'application (« Quitter » dans la zone de notification). Aucune réinstallation à la main.
 */
export type NiveauMiseAJour = "indisponible" | "inconnu" | "verification" | "a-jour" | "disponible" | "telechargement" | "prete" | "erreur";

export interface EtatMiseAJourBureau {
  etat: NiveauMiseAJour;
  versionInstallee: string;
  /** Version proposée (ou téléchargée). */
  version: string | null;
  notes: string;
  /** 0-100 pendant le téléchargement. */
  progres: number;
  erreur: string | null;
  verifieeLe: string | null;
}

const INTERVALLE_MS = 3 * 3_600_000;

let etat: EtatMiseAJourBureau = {
  // Une application lancée depuis le dépôt (développement) n'a pas d'installateur à mettre à jour.
  etat: app.isPackaged ? "inconnu" : "indisponible",
  versionInstallee: app.getVersion(),
  version: null,
  notes: "",
  progres: 0,
  erreur: null,
  verifieeLe: null,
};

type Ecouteur = (e: EtatMiseAJourBureau) => void;
let ecouteur: Ecouteur | null = null;
let evenementsBranches = false;
let enVerification = false;

function changer(partiel: Partial<EtatMiseAJourBureau>): void {
  etat = { ...etat, ...partiel };
  ecouteur?.(etat);
}

function texteNotes(info: UpdateInfo): string {
  const n = info.releaseNotes;
  if (typeof n === "string") return notesLisibles(n.replace(/<[^>]+>/g, " "));
  if (Array.isArray(n)) return notesLisibles(n.map((x) => x.note ?? "").join("\n").replace(/<[^>]+>/g, " "));
  return "";
}

export function etatMiseAJour(): EtatMiseAJourBureau {
  return etat;
}

/** `surChangement` : appelé à chaque évolution (envoi à l'interface, notification Windows). `avantInstallation` : prépare la vraie fermeture de l'application. */
export function demarrerMiseAJour(options: { surChangement: Ecouteur; surNouvelleVersion: (version: string) => void; surPrete: (version: string) => void }): void {
  ecouteur = options.surChangement;
  if (!app.isPackaged || evenementsBranches) return;
  evenementsBranches = true;
  autoUpdater.autoDownload = false; // on ne télécharge que quand l'utilisateur le demande
  autoUpdater.autoInstallOnAppQuit = true; // « Plus tard » : installée toute seule à la fermeture
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;

  autoUpdater.on("update-available", (info) => {
    const deja = etat.version === info.version && (etat.etat === "telechargement" || etat.etat === "prete");
    if (deja) return;
    changer({ etat: "disponible", version: info.version, notes: texteNotes(info), progres: 0, erreur: null });
    options.surNouvelleVersion(info.version);
  });
  autoUpdater.on("update-not-available", () => changer({ etat: "a-jour", version: null, notes: "", progres: 0, erreur: null }));
  autoUpdater.on("download-progress", (p) => changer({ etat: "telechargement", progres: Math.min(100, Math.floor(p.percent)) }));
  autoUpdater.on("update-downloaded", (info) => {
    changer({ etat: "prete", version: info.version, progres: 100, erreur: null });
    options.surPrete(info.version);
  });
  autoUpdater.on("error", (e) => {
    // Une vérification qui échoue (pas de connexion) ne dérange pas ; un téléchargement interrompu se relance d'un clic.
    changer({ etat: etat.etat === "telechargement" ? "erreur" : etat.etat === "verification" ? "inconnu" : etat.etat, erreur: etat.etat === "telechargement" ? "Le téléchargement s'est interrompu. Réessayez." : etat.erreur });
    void e;
  });

  setTimeout(() => void verifierMiseAJour(), 10_000);
  setInterval(() => void verifierMiseAJour(), INTERVALLE_MS);
}

/** `manuel` : l'utilisateur a cliqué « Chercher une mise à jour » — l'échec est alors expliqué. */
export async function verifierMiseAJour(manuel = false): Promise<EtatMiseAJourBureau> {
  if (!app.isPackaged || enVerification || etat.etat === "telechargement" || etat.etat === "prete") return etat;
  enVerification = true;
  if (manuel) changer({ etat: "verification", erreur: null });
  try {
    await autoUpdater.checkForUpdates();
    changer({ verifieeLe: new Date().toISOString() });
  } catch {
    changer({ etat: manuel ? "erreur" : etat.etat === "verification" ? "inconnu" : etat.etat, erreur: manuel ? "Impossible de vérifier pour le moment. Vérifiez la connexion Internet puis réessayez." : etat.erreur });
  } finally {
    enVerification = false;
  }
  return etat;
}

export async function telechargerMiseAJour(): Promise<EtatMiseAJourBureau> {
  if (!app.isPackaged || (etat.etat !== "disponible" && etat.etat !== "erreur")) return etat;
  changer({ etat: "telechargement", progres: 0, erreur: null });
  try {
    await autoUpdater.downloadUpdate();
  } catch {
    changer({ etat: "erreur", erreur: "Le téléchargement s'est interrompu. Réessayez." });
  }
  return etat;
}

/** « Redémarrer maintenant » : ferme l'application, installe, rouvre. */
export function installerMiseAJour(avantInstallation: () => void): void {
  if (!app.isPackaged || etat.etat !== "prete") return;
  avantInstallation();
  autoUpdater.quitAndInstall(true, true);
}
