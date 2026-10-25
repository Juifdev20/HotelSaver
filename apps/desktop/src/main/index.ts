import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, screen, session, shell, Tray } from "electron";
import { join, resolve } from "path";
import { cleChiffrementLocale, ecrireConfiguration, lireConfiguration } from "./config-store";
import { imprimerLignes } from "./imprimante";

// Permet de lancer une instance isolée (tests E2E, ou deux postes de test sur
// la même machine) sans toucher à la configuration/session de l'instance
// principale. Doit être appelé avant `ready`.
// (Réservé aux versions non installées : une variable d'environnement ne doit pas pouvoir rediriger les données d'un poste en production.)
if (process.env.HOTEL_CHICAGO_USER_DATA && !app.isPackaged) {
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

// Identifiant Windows de l'application : sans lui, les notifications s'affichent sous « electron.app… ».
app.setAppUserModelId("com.hotelsaver.desktop");

let fenetrePrincipale: BrowserWindow | null = null;
let zoneNotification: Tray | null = null;
/** Vrai seulement quand l'utilisateur choisit « Quitter » : fermer la fenêtre, elle, la réduit
 * dans la zone de notification pour que l'application continue d'écouter les alertes. */
let quitterVraiment = false;
/** Dernier lien reçu et pas encore lu par l'interface (ex. lancement à froid par le lien,
 * avant que la fenêtre ait chargé) — l'interface le réclame au démarrage. */
let lienEnAttente: string | null = lienDepuisArguments(process.argv);

function traiterLien(url: string | null): void {
  if (!url) return;
  lienEnAttente = url;
  if (fenetrePrincipale && !fenetrePrincipale.isDestroyed()) {
    if (fenetrePrincipale.isMinimized()) fenetrePrincipale.restore();
    fenetrePrincipale.show();
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
  app.on("second-instance", (_evenement, argv) => {
    // Fenêtre masquée dans la zone de notification : relancer l'application la réaffiche.
    if (fenetrePrincipale && !fenetrePrincipale.isDestroyed()) fenetrePrincipale.show();
    traiterLien(lienDepuisArguments(argv));
  });
}

/**
 * Fenêtre minimale : en dessous, l'interface passerait en mode téléphone (barre du bas). 880 px laisse tout juste la barre latérale réduite
 * et un tableau lisible, et reste atteignable sur un portable 1366 px réglé à 150 % d'affichage Windows (≈ 910 px utiles).
 */
const LARGEUR_MINIMALE = 880;
const HAUTEUR_MINIMALE = 560;

/** Taille de départ : 90 % de la zone utile de l'écran, entre 1280 × 800 et 1600 × 1000, sans jamais dépasser l'écran lui-même. */
function tailleInitiale(): { width: number; height: number } {
  const zone = screen.getPrimaryDisplay().workAreaSize;
  const entre = (valeur: number, mini: number, maxi: number) => Math.max(mini, Math.min(valeur, maxi));
  return {
    width: Math.min(zone.width, Math.round(entre(zone.width * 0.9, 1280, 1600))),
    height: Math.min(zone.height, Math.round(entre(zone.height * 0.9, 800, 1000))),
  };
}

function creerFenetrePrincipale(): BrowserWindow {
  const { width, height } = tailleInitiale();
  const fenetre = new BrowserWindow({
    width,
    height,
    minWidth: Math.min(LARGEUR_MINIMALE, width),
    minHeight: Math.min(HAUTEUR_MINIMALE, height),
    autoHideMenuBar: true,
    // Icône HotelSaver (fenêtre/barre des tâches en dev ; resources/ est la
    // convention electron-vite reprise par le packaging — icon.ico pour Windows).
    icon: join(__dirname, "../../resources/icon.png"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      // Le preload n'utilise que contextBridge/ipcRenderer : le bac à sable reste donc actif (un défaut du rendu ne donne pas accès au système).
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Outils de développement : désactivés dans l'application installée (ils donneraient accès à la base locale et aux jetons).
      devTools: !app.isPackaged,
      // Fenêtre masquée : sans cela Chromium ralentit les minuteries et l'écoute des notifications s'endort.
      backgroundThrottling: false,
    },
  });

  fenetre.on("close", (evenement) => {
    if (quitterVraiment) return;
    evenement.preventDefault();
    fenetre.hide();
  });

  // Jamais d'autre schéma que https/mailto/tel vers le système (file:, ms-*:, schémas personnalisés exécutent des programmes).
  const ouvrirSiSur = (url: string) => {
    try {
      const { protocol } = new URL(url);
      if (protocol === "https:" || protocol === "mailto:" || protocol === "tel:") void shell.openExternal(url);
    } catch {
      /* URL illisible : ignorée */
    }
  };
  fenetre.webContents.setWindowOpenHandler((details) => {
    ouvrirSiSur(details.url);
    return { action: "deny" };
  });
  // L'application ne navigue jamais ailleurs que dans son propre contenu.
  const refuserNavigation = (evenement: { preventDefault(): void }, url: string) => {
    if (url.startsWith("file://") || url.startsWith(process.env["ELECTRON_RENDERER_URL"] ?? "\u0000")) return;
    evenement.preventDefault();
    ouvrirSiSur(url);
  };
  fenetre.webContents.on("will-navigate", refuserNavigation);
  fenetre.webContents.on("will-redirect", refuserNavigation);

  // electron-vite définit ELECTRON_RENDERER_URL en mode dev (serveur Vite) ;
  // en production, le renderer est un fichier statique déjà buildé.
  if (!app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
    fenetre.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    fenetre.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return fenetre;
}

function afficherFenetre(): BrowserWindow {
  if (!fenetrePrincipale || fenetrePrincipale.isDestroyed()) fenetrePrincipale = creerFenetrePrincipale();
  if (fenetrePrincipale.isMinimized()) fenetrePrincipale.restore();
  fenetrePrincipale.show();
  fenetrePrincipale.focus();
  return fenetrePrincipale;
}

function creerZoneNotification(): void {
  const icone = nativeImage.createFromPath(join(__dirname, "../../resources/icon.png")).resize({ width: 16, height: 16 });
  zoneNotification = new Tray(icone);
  zoneNotification.setToolTip("HotelSaver");
  zoneNotification.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Ouvrir HotelSaver", click: () => afficherFenetre() },
      { type: "separator" },
      {
        label: "Quitter",
        click: () => {
          quitterVraiment = true;
          app.quit();
        },
      },
    ])
  );
  zoneNotification.on("click", () => afficherFenetre());
}

if (premiereInstance) {
  app.whenReady().then(() => {
    // Application installée : pas de barre de menus (donc pas de raccourci vers les outils de développement) et permissions limitées à ce
    // dont l'application a besoin (caméra du lecteur de codes-barres, notifications).
    if (app.isPackaged) Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_contenu, permission, rappel) => {
      rappel(permission === "media" || permission === "notifications" || permission === "clipboard-sanitized-write");
    });
    ipcMain.handle("configuration:lire", () => lireConfiguration());
    ipcMain.handle("securite:cle-locale", () => cleChiffrementLocale());
    ipcMain.handle("configuration:ecrire", (_evenement, partielle) => ecrireConfiguration(partielle));
    ipcMain.handle("impression:imprimer", (_evenement, interfaceImprimante, lignes) => imprimerLignes(interfaceImprimante, lignes));
    // Ouvre la page Bluetooth des paramètres Windows. Adresse fixe, jamais fournie par l'interface.
    ipcMain.handle("systeme:reglages-bluetooth", async () => {
      if (process.platform === "win32") await shell.openExternal("ms-settings:bluetooth");
    });
    // Lien reçu avant que l'interface soit prête : lu une seule fois.
    ipcMain.handle("lien:en-attente", () => {
      const lien = lienEnAttente;
      lienEnAttente = null;
      return lien;
    });

    // Notification Windows : un clic ramène l'application au premier plan et ouvre l'écran concerné.
    ipcMain.handle("notification:afficher", (_evenement, titre: string, corps: string, lien: { ecran: string; id?: string }) => {
      if (!Notification.isSupported()) return;
      const notification = new Notification({ title: titre, body: corps, icon: join(__dirname, "../../resources/icon.png") });
      notification.on("click", () => afficherFenetre().webContents.send("notification:ouverte", lien));
      notification.show();
    });
    ipcMain.handle("application:lancer-au-demarrage:lire", () => app.getLoginItemSettings().openAtLogin);
    ipcMain.handle("application:lancer-au-demarrage:ecrire", (_evenement, actif: boolean) => {
      app.setLoginItemSettings({ openAtLogin: actif });
      return app.getLoginItemSettings().openAtLogin;
    });

    fenetrePrincipale = creerFenetrePrincipale();
    creerZoneNotification();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        fenetrePrincipale = creerFenetrePrincipale();
      }
    });
  });
}

app.on("before-quit", () => {
  quitterVraiment = true;
});

// La fenêtre se masque à la fermeture (voir creerFenetrePrincipale) : l'application reste dans la zone
// de notification et ne se termine que par « Quitter ».
app.on("window-all-closed", () => {});
