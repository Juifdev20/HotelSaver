import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join, resolve } from "path";
import { ecrireConfiguration, lireConfiguration } from "./config-store";
import { imprimerLignes, imprimerTicketDeTest } from "./imprimante";

// Permet de lancer une instance isolée (tests E2E, ou deux postes de test sur
// la même machine) sans toucher à la configuration/session de l'instance
// principale. Doit être appelé avant `ready`.
if (process.env.HOTEL_CHICAGO_USER_DATA) {
  app.setPath("userData", process.env.HOTEL_CHICAGO_USER_DATA);
}

// --- Lien profond « Ouvrir l'application » du site web : hotelsaver://connexion?email=… ---
const PROTOCOLE = "hotelsaver";

/** Enregistre `hotelsaver://` pour cette application (clé HKCU sous Windows : aucun droit
 * administrateur). En développement l'exécutable est Electron lui-même : il faut lui repasser
 * le chemin de l'application. Un installateur futur devra faire la même déclaration. */
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOLE, process.execPath, [resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOLE);
}

function lienDepuisArguments(args: string[]): string | null {
  return args.find((argument) => argument.toLowerCase().startsWith(`${PROTOCOLE}://`)) ?? null;
}

let fenetrePrincipale: BrowserWindow | null = null;
/** Dernier lien reçu et pas encore lu par l'interface (ex. lancement à froid par le lien,
 * avant que la fenêtre ait chargé) — l'interface le réclame au démarrage. */
let lienEnAttente: string | null = lienDepuisArguments(process.argv);

function traiterLien(url: string | null): void {
  if (!url) return;
  lienEnAttente = url;
  if (fenetrePrincipale && !fenetrePrincipale.isDestroyed()) {
    if (fenetrePrincipale.isMinimized()) fenetrePrincipale.restore();
    fenetrePrincipale.focus();
    fenetrePrincipale.webContents.send("lien:ouvert", url);
  }
}

// Une seule fenêtre : cliquer un lien hotelsaver:// avec l'application déjà ouverte la
// ramène au premier plan au lieu d'en ouvrir une seconde.
const premiereInstance = app.requestSingleInstanceLock();
if (!premiereInstance) {
  app.quit();
} else {
  app.on("second-instance", (_evenement, argv) => traiterLien(lienDepuisArguments(argv)));
}

function creerFenetrePrincipale(): BrowserWindow {
  const fenetre = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    // Icône HotelSaver (fenêtre/barre des tâches en dev ; resources/ est la
    // convention electron-vite reprise par le packaging — icon.ico pour Windows).
    icon: join(__dirname, "../../resources/icon.png"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  fenetre.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // electron-vite définit ELECTRON_RENDERER_URL en mode dev (serveur Vite) ;
  // en production, le renderer est un fichier statique déjà buildé.
  if (process.env["ELECTRON_RENDERER_URL"]) {
    fenetre.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    fenetre.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return fenetre;
}

if (premiereInstance) {
  app.whenReady().then(() => {
    ipcMain.handle("configuration:lire", () => lireConfiguration());
    ipcMain.handle("configuration:ecrire", (_evenement, partielle) => ecrireConfiguration(partielle));
    ipcMain.handle("impression:imprimer", (_evenement, interfaceImprimante, lignes) => imprimerLignes(interfaceImprimante, lignes));
    ipcMain.handle("impression:test", (_evenement, interfaceImprimante) => imprimerTicketDeTest(interfaceImprimante));
    // Lien reçu avant que l'interface soit prête : lu une seule fois.
    ipcMain.handle("lien:en-attente", () => {
      const lien = lienEnAttente;
      lienEnAttente = null;
      return lien;
    });

    fenetrePrincipale = creerFenetrePrincipale();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        fenetrePrincipale = creerFenetrePrincipale();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
