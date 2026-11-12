import { app, shell } from "electron";
import { appendFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  /** Vrai quand la dernière installation silencieuse n'a pas abouti : cette fois, l'assistant d'installation s'ouvre (visible, avec ses éventuelles erreurs). */
  assistant: boolean;
}

// ---- Journal et trace de la dernière tentative (12/11/2026) -----------------------------------------------------------------------------------------
// Une installation silencieuse qui échoue ne dit rien : l'ancienne version revenait sans explication. Tout est maintenant écrit dans
// `mise-a-jour.log` (dossier de données de l'application, %APPDATA%\HotelSaver) et la tentative est notée avant la fermeture : au lancement suivant,
// si la version n'a pas changé, l'application le sait et propose l'assistant d'installation.
const journalChemin = (): string => join(app.getPath("userData"), "mise-a-jour.log");
const traceChemin = (): string => join(app.getPath("userData"), "mise-a-jour-tentative.json");

function ecrireJournal(niveau: string, ...messages: unknown[]): void {
  try {
    const f = journalChemin();
    if (existsSync(f) && statSync(f).size > 200_000) rmSync(f);
    const texte = messages.map((m) => (m instanceof Error ? `${m.message}\n${m.stack ?? ""}` : typeof m === "string" ? m : JSON.stringify(m))).join(" ");
    appendFileSync(f, `${new Date().toISOString()} [${niveau}] ${texte}\n`);
  } catch {
    /* le journal ne doit jamais gêner l'application */
  }
}

function plusRecent(a: string, b: string): boolean {
  const x = a.split(".").map((n) => parseInt(n, 10) || 0);
  const y = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

/** La dernière installation demandée a-t-elle échoué (la version installée n'a pas avancé) ? Trace effacée dès qu'elle a servi. */
function derniereInstallationEchouee(): boolean {
  try {
    if (!existsSync(traceChemin())) return false;
    const { version } = JSON.parse(readFileSync(traceChemin(), "utf8")) as { version: string };
    if (!plusRecent(version, app.getVersion())) {
      rmSync(traceChemin(), { force: true });
      ecrireJournal("info", `Installation de ${version} réussie : la version installée est ${app.getVersion()}.`);
      return false;
    }
    ecrireJournal("warn", `L'installation silencieuse de ${version} n'a pas abouti (version installée : ${app.getVersion()}).`);
    return true;
  } catch {
    return false;
  }
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
  assistant: false,
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
  autoUpdater.logger = {
    info: (m?: unknown) => ecrireJournal("info", m),
    warn: (m?: unknown) => ecrireJournal("warn", m),
    error: (m?: unknown) => ecrireJournal("error", m),
    debug: (m?: unknown) => ecrireJournal("debug", m),
  };
  ecrireJournal("info", `Démarrage de HotelSaver ${app.getVersion()}.`);
  if (derniereInstallationEchouee()) {
    changer({ assistant: true, erreur: "La dernière installation automatique n'a pas abouti. Cette fois, l'assistant d'installation va s'ouvrir : suivez-le jusqu'au bout." });
  }

  autoUpdater.on("update-available", (info) => {
    const deja = etat.version === info.version && (etat.etat === "telechargement" || etat.etat === "prete");
    if (deja) return;
    changer({ etat: "disponible", version: info.version, notes: texteNotes(info), progres: 0, erreur: etat.assistant ? etat.erreur : null });
    options.surNouvelleVersion(info.version);
  });
  autoUpdater.on("update-not-available", () => changer({ etat: "a-jour", version: null, notes: "", progres: 0, erreur: null }));
  autoUpdater.on("download-progress", (p) => changer({ etat: "telechargement", progres: Math.min(100, Math.floor(p.percent)) }));
  autoUpdater.on("update-downloaded", (info) => {
    changer({ etat: "prete", version: info.version, progres: 100, erreur: null });
    options.surPrete(info.version);
  });
  autoUpdater.on("error", (e) => {
    ecrireJournal("error", e);
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

/**
 * « Redémarrer maintenant » : ferme VRAIMENT l'application (fenêtre, zone de notification, verrou d'instance), puis installe et rouvre.
 * Mode normal : installation silencieuse. Si la précédente a échoué (`assistant`), l'assistant d'installation de Windows s'ouvre à la place.
 */
export function installerMiseAJour(avantInstallation: () => void): void {
  if (!app.isPackaged || etat.etat !== "prete") return;
  ecrireJournal("info", `Installation de ${etat.version} demandée (${etat.assistant ? "assistant" : "silencieuse"}).`);
  try {
    writeFileSync(traceChemin(), JSON.stringify({ version: etat.version, le: new Date().toISOString(), assistant: etat.assistant }));
  } catch {
    /* sans trace, on installe quand même */
  }
  avantInstallation();
  if (etat.assistant) {
    const fichier = (autoUpdater as unknown as { downloadedUpdateHelper?: { file?: string } }).downloadedUpdateHelper?.file;
    if (fichier) {
      ecrireJournal("info", `Ouverture de l'assistant : ${fichier}`);
      void shell.openPath(fichier).then((erreur) => {
        if (erreur) ecrireJournal("error", `Assistant non ouvert : ${erreur}`);
        setTimeout(() => app.exit(0), 1500);
      });
      return;
    }
    ecrireJournal("warn", "Fichier d'installation introuvable : installation silencieuse.");
  }
  // L'installateur attend que l'application ait disparu : si la fermeture traînait, on la force après quelques secondes.
  setTimeout(() => {
    ecrireJournal("warn", "L'application ne s'est pas fermée seule : arrêt forcé pour laisser l'installateur travailler.");
    app.exit(0);
  }, 6_000).unref();
  autoUpdater.quitAndInstall(true, true);
}
