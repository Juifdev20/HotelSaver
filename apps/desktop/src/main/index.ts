import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "path";
import { ecrireConfiguration, lireConfiguration } from "./config-store";
import { imprimerLignes, imprimerTicketDeTest } from "./imprimante";

// Permet de lancer une instance isolée (tests E2E, ou deux postes de test sur
// la même machine) sans toucher à la configuration/session de l'instance
// principale. Doit être appelé avant `ready`.
if (process.env.HOTEL_CHICAGO_USER_DATA) {
  app.setPath("userData", process.env.HOTEL_CHICAGO_USER_DATA);
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

app.whenReady().then(() => {
  ipcMain.handle("configuration:lire", () => lireConfiguration());
  ipcMain.handle("configuration:ecrire", (_evenement, partielle) => ecrireConfiguration(partielle));
  ipcMain.handle("impression:imprimer", (_evenement, interfaceImprimante, lignes) => imprimerLignes(interfaceImprimante, lignes));
  ipcMain.handle("impression:test", (_evenement, interfaceImprimante) => imprimerTicketDeTest(interfaceImprimante));

  creerFenetrePrincipale();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      creerFenetrePrincipale();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
