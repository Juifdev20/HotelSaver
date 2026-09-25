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
};

contextBridge.exposeInMainWorld("hotelChicago", api);

export type ApiPreload = typeof api;
