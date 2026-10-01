import { contextBridge, ipcRenderer } from "electron";
import type { ConfigurationApp } from "../main/config-store";
import type { LigneRecu } from "@hotel-chicago/receipts";

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
};

contextBridge.exposeInMainWorld("hotelChicago", api);

export type ApiPreload = typeof api;
