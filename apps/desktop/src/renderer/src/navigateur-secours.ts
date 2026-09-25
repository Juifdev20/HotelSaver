import type { ApiPreload } from "../../preload";
import type { ConfigurationApp } from "../../main/config-store";

/**
 * Filet de secours pour prévisualiser le renderer dans un simple navigateur
 * (ex. téléphone connecté en USB via `adb reverse`, pour vérifier le rendu
 * responsive sur un vrai écran) — sans passer par l'app Electron packagée.
 * `window.hotelChicago` n'existe alors pas (il vient du script preload,
 * jamais chargé hors d'Electron) : on le fournit ici, adossé à
 * localStorage, avec exactement la même forme que le vrai (voir
 * `main/config-store.ts`). Ne s'active JAMAIS dans l'app réelle : le script
 * preload s'exécute avant ce module et pose déjà `window.hotelChicago`.
 */
const CLE_STOCKAGE = "hotel-chicago:config-navigateur";

const VALEURS_PAR_DEFAUT: ConfigurationApp = {
  // Pense à `adb reverse tcp:3001 tcp:3001` : le téléphone joint alors le
  // serveur de l'hôtel qui tourne sur le PC via le câble USB, sans IP réseau
  // à connaître ni à exposer sur le Wi-Fi.
  apiUrl: "http://localhost:3001",
  supabaseUrl: "https://krvhnsyvlkgvcxncvwkx.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtydmhuc3l2bGtndmN4bmN2d2t4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDI1NjYsImV4cCI6MjEwNTgxODU2Nn0.7hIYhQG8M1qEDIJZENRgR9gxAyUW1q9DmuSRqiYX__Y",
  refreshToken: null,
};

function lire(): ConfigurationApp {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    return brut ? { ...VALEURS_PAR_DEFAUT, ...JSON.parse(brut) } : VALEURS_PAR_DEFAUT;
  } catch {
    return VALEURS_PAR_DEFAUT;
  }
}

function ecrire(partielle: Partial<ConfigurationApp>): ConfigurationApp {
  const nouvelle = { ...lire(), ...partielle };
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(nouvelle));
  } catch {
    // Stockage indisponible : la config reste active pour la session en cours.
  }
  return nouvelle;
}

export function installerFilSecoursNavigateur(): void {
  if (window.hotelChicago) return; // déjà fourni par le preload Electron

  const api: ApiPreload = {
    lireConfiguration: () => Promise.resolve(lire()),
    ecrireConfiguration: (partielle) => Promise.resolve(ecrire(partielle)),
  };
  window.hotelChicago = api;
}
