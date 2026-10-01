import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Configuration de l'app (même principe que le desktop, `apps/desktop/src/main/config-store.ts`,
 * adapté avec AsyncStorage puisqu'il n'y a pas de process principal Electron). L'adresse de
 * l'API est fixée à la compilation (`EXPO_PUBLIC_API_URL`) : aucun écran ne la propose, un
 * utilisateur n'a pas à manipuler une URL technique (DECISIONS.md, 01/10/2026).
 */
export interface ConfigurationApp {
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const CLE = "hotel-chicago:configuration";

// Mêmes valeurs par défaut que le desktop (clé anon publique, sans risque à
// embarquer). `apiUrl` pointe sur localhost : en développement, le téléphone
// y accède via `adb reverse tcp:3001 tcp:3001` (câble USB, pas de forfait
// data ni d'IP réseau à connaître) — voir README.md.
// Expo remplace `process.env.EXPO_PUBLIC_*` par sa valeur au build. Build de production :
//   EXPO_PUBLIC_API_URL=https://api.hotelsaver.com (voir .env.example).
const API_URL_COMPILATION: string = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";

const VALEURS_PAR_DEFAUT: ConfigurationApp = {
  apiUrl: API_URL_COMPILATION,
  supabaseUrl: "https://zjplcqocmkctbfxnxheq.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqcGxjcW9jbWtjdGJmeG54aGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NTg0MzgsImV4cCI6MjEwNjAzNDQzOH0.fkgb9UjnDKQ956wWrv73EAGbBcJly_NrfS-pwKibMSI",
};

export async function lireConfiguration(): Promise<ConfigurationApp> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    // L'adresse de l'API vient TOUJOURS du build : un ancien `apiUrl` mémorisé (du temps où
    // l'écran Paramètres la proposait) ne doit pas masquer celle de la version installée.
    return brut ? { ...VALEURS_PAR_DEFAUT, ...JSON.parse(brut), apiUrl: API_URL_COMPILATION } : VALEURS_PAR_DEFAUT;
  } catch {
    return VALEURS_PAR_DEFAUT;
  }
}

export async function ecrireConfiguration(partielle: Partial<ConfigurationApp>): Promise<ConfigurationApp> {
  const nouvelle = { ...(await lireConfiguration()), ...partielle };
  await AsyncStorage.setItem(CLE, JSON.stringify(nouvelle));
  return nouvelle;
}
