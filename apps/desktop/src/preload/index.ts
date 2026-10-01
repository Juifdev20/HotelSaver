import { contextBridge, ipcRenderer } from "electron";
import type { ConfigurationApp } from "../main/config-store";
import type { LigneRecu } from "@hotel-chicago/receipts";
import type { LienNotification } from "@hotel-chicago/types";

const api = {
  lireConfiguration: (): Promise<ConfigurationApp> => ipcRenderer.invoke("configuration:lire"),
  ecrireConfiguration: (partielle: Partial<ConfigurationApp>): Promise<ConfigurationApp> =>
    ipcRenderer.invoke("configuration:ecrire", partielle),
  imprimer: (interfaceImprimante: string, lignes: LigneRecu[]): Promise<void> =>
    ipcRenderer.invoke("impression:imprimer", interfaceImprimante, lignes),
  imprimerTicketDeTest: (interfaceImprimante: string): Promise<void> =>
    ipcRenderer.invoke("impression:test", interfaceImprimante),
  /** Lien hotelsaver:// reçu avant que l'interface soit prête (lu une seule fois). */
  lireLienEnAttente: (): Promise<string | null> => ipcRenderer.invoke("lien:en-attente"),
  /** Lien hotelsaver:// reçu pendant que l'application tourne ; renvoie la fonction de désabonnement. */
  surLienOuvert: (rappel: (url: string) => void): (() => void) => {
    const ecouteur = (_evenement: unknown, url: string) => rappel(url);
    ipcRenderer.on("lien:ouvert", ecouteur);
    return () => {
      ipcRenderer.removeListener("lien:ouvert", ecouteur);
    };
  },
  /** Notification Windows (visible même fenêtre masquée) ; un clic déclenche `surNotificationOuverte`. */
  notifier: (titre: string, corps: string, lien: LienNotification): Promise<void> =>
    ipcRenderer.invoke("notification:afficher", titre, corps, lien),
  surNotificationOuverte: (rappel: (lien: LienNotification) => void): (() => void) => {
    const ecouteur = (_evenement: unknown, lien: LienNotification) => rappel(lien);
    ipcRenderer.on("notification:ouverte", ecouteur);
    return () => {
      ipcRenderer.removeListener("notification:ouverte", ecouteur);
    };
  },
  lireLancerAuDemarrage: (): Promise<boolean> => ipcRenderer.invoke("application:lancer-au-demarrage:lire"),
  ecrireLancerAuDemarrage: (actif: boolean): Promise<boolean> => ipcRenderer.invoke("application:lancer-au-demarrage:ecrire", actif),
};

contextBridge.exposeInMainWorld("hotelChicago", api);

export type ApiPreload = typeof api;
