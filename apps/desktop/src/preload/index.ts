import { contextBridge, ipcRenderer } from "electron";
import type { ConfigurationApp } from "../main/config-store";
import type { ImprimanteProposee, LigneRecu } from "@hotel-chicago/receipts";
import type { LienNotification } from "@hotel-chicago/types";
import type { EtatMiseAJourBureau } from "../main/mise-a-jour";

const api = {
  lireConfiguration: (): Promise<ConfigurationApp> => ipcRenderer.invoke("configuration:lire"),
  ecrireConfiguration: (partielle: Partial<ConfigurationApp>): Promise<ConfigurationApp> =>
    ipcRenderer.invoke("configuration:ecrire", partielle),
  /** Clé (base64, 32 octets) qui chiffre la copie locale des données ; fournie par le processus principal, jamais stockée côté interface. */
  lireCleLocale: (): Promise<string> => ipcRenderer.invoke("securite:cle-locale"),
  imprimer: (interfaceImprimante: string, lignes: LigneRecu[]): Promise<void> =>
    ipcRenderer.invoke("impression:imprimer", interfaceImprimante, lignes),
  /** Imprimantes proposées sur ce poste : installées dans Windows + ports série (dont le Bluetooth appairé). */
  listerImprimantes: (): Promise<ImprimanteProposee[]> => ipcRenderer.invoke("impression:lister"),
  /** Ouvre une page des paramètres Windows : Bluetooth (activer, appairer) ou Imprimantes (ajouter un pilote). */
  ouvrirReglages: (page: "bluetooth" | "imprimantes"): Promise<void> => ipcRenderer.invoke("systeme:ouvrir-reglages", page),
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
  /** Mises à jour (electron-updater) : lire l'état, chercher, télécharger en arrière-plan, redémarrer pour installer. */
  miseAJour: {
    etat: (): Promise<EtatMiseAJourBureau> => ipcRenderer.invoke("maj:etat"),
    verifier: (): Promise<EtatMiseAJourBureau> => ipcRenderer.invoke("maj:verifier"),
    telecharger: (): Promise<EtatMiseAJourBureau> => ipcRenderer.invoke("maj:telecharger"),
    installer: (): Promise<void> => ipcRenderer.invoke("maj:installer"),
    surChangement: (rappel: (etat: EtatMiseAJourBureau) => void): (() => void) => {
      const ecouteur = (_evenement: unknown, etat: EtatMiseAJourBureau) => rappel(etat);
      ipcRenderer.on("maj:etat", ecouteur);
      return () => {
        ipcRenderer.removeListener("maj:etat", ecouteur);
      };
    },
    /** Clic sur la notification Windows « nouvelle version » : ouvre l'écran Mise à jour. */
    surOuverture: (rappel: () => void): (() => void) => {
      const ecouteur = () => rappel();
      ipcRenderer.on("maj:ouvrir", ecouteur);
      return () => {
        ipcRenderer.removeListener("maj:ouvrir", ecouteur);
      };
    },
  },
  lireLancerAuDemarrage: (): Promise<boolean> => ipcRenderer.invoke("application:lancer-au-demarrage:lire"),
  ecrireLancerAuDemarrage: (actif: boolean): Promise<boolean> => ipcRenderer.invoke("application:lancer-au-demarrage:ecrire", actif),
};

contextBridge.exposeInMainWorld("hotelChicago", api);

export type ApiPreload = typeof api;
