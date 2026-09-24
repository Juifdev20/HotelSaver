import { contextBridge, ipcRenderer } from "electron";
import type { ConfigurationApp } from "../main/config-store";

const api = {
  lireConfiguration: (): Promise<ConfigurationApp> => ipcRenderer.invoke("configuration:lire"),
  ecrireConfiguration: (partielle: Partial<ConfigurationApp>): Promise<ConfigurationApp> =>
    ipcRenderer.invoke("configuration:ecrire", partielle),
};

contextBridge.exposeInMainWorld("hotelChicago", api);

export type ApiPreload = typeof api;
