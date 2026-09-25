import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Section 6 : l'URL de l'API et les identifiants Supabase se configurent
 * depuis l'app (écran Paramètres), jamais un .env — même principe que le
 * desktop (`apps/desktop/src/main/config-store.ts`), adapté ici avec
 * AsyncStorage puisqu'il n'y a pas de process principal Electron.
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
const VALEURS_PAR_DEFAUT: ConfigurationApp = {
  apiUrl: "http://localhost:3001",
  supabaseUrl: "https://krvhnsyvlkgvcxncvwkx.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtydmhuc3l2bGtndmN4bmN2d2t4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDI1NjYsImV4cCI6MjEwNTgxODU2Nn0.7hIYhQG8M1qEDIJZENRgR9gxAyUW1q9DmuSRqiYX__Y",
};

export async function lireConfiguration(): Promise<ConfigurationApp> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    return brut ? { ...VALEURS_PAR_DEFAUT, ...JSON.parse(brut) } : VALEURS_PAR_DEFAUT;
  } catch {
    return VALEURS_PAR_DEFAUT;
  }
}

export async function ecrireConfiguration(partielle: Partial<ConfigurationApp>): Promise<ConfigurationApp> {
  const nouvelle = { ...(await lireConfiguration()), ...partielle };
  await AsyncStorage.setItem(CLE, JSON.stringify(nouvelle));
  return nouvelle;
}
