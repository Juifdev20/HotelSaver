import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

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

/** IP du PC de développement telle que le dev-client la connaît déjà :
 * `Constants.expoConfig.hostUri` est l'hôte Metro (ex. "172.20.10.2:8081"),
 * donc l'IP Wi-Fi actuelle de la machine — elle suit les changements de
 * réseau sans jamais être codée en dur. `null` hors dev-client. */
function apiUrlViaWifi(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  const ip = hostUri?.split(":")[0];
  if (!ip || ip === "localhost" || ip === "127.0.0.1") return null;
  return `http://${ip}:3000`;
}

/** Toutes les façons de joindre le serveur, dans l'ordre de préférence :
 * la valeur du build (prod : l'URL publique ; dev : 127.0.0.1 via le câble
 * USB), puis l'IP Wi-Fi courante en dev, puis localhost en dernier recours.
 * ClientApi essaie chacune jusqu'à une réponse (voir client.ts). */
/** Adresse du poste ou du réseau local (127.0.0.1, localhost, 10.x, 192.168.x, 172.16-31.x), en http. */
function estAdresseLocale(url: string): boolean {
  return /^http:\/\/(127\.0\.0\.1|localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?(\/|$)/i.test(url);
}

export function candidatsApi(): string[] {
  // Version installée : uniquement l'adresse du build, et en https. Les repli locaux (127.0.0.1, IP Wi-Fi du poste de développement) ne
  // servent qu'en développement : sinon, serveur injoignable, le mot de passe partirait en clair vers n'importe quelle application locale.
  // L'APK de développement embarque son JS (`debuggableVariants = []`, voir AGENTS.md) et tourne donc avec
  // `__DEV__` faux : sans cette exception, une adresse locale compilée exprès (127.0.0.1 via le câble USB)
  // était rejetée et l'application ne joignait plus aucun serveur (16/10/2026). Une version publiée, elle,
  // est compilée avec l'adresse https publique : une adresse locale ne peut être qu'un choix de développement.
  if (!__DEV__ && !estAdresseLocale(API_URL_COMPILATION)) {
    if (!API_URL_COMPILATION.startsWith("https://")) {
      // eslint-disable-next-line no-console
      console.warn("EXPO_PUBLIC_API_URL n'est pas une adresse https : la connexion au serveur sera refusée en production.");
      return [];
    }
    return [API_URL_COMPILATION];
  }
  const candidats = [API_URL_COMPILATION, apiUrlViaWifi(), "http://127.0.0.1:3000"];
  return [...new Set(candidats.filter((u): u is string => Boolean(u)))];
}

// Mêmes valeurs par défaut que le desktop (clé anon publique, sans risque à
// embarquer). `apiUrl` pointe sur localhost : en développement, le téléphone
// y accède via `adb reverse tcp:3001 tcp:3001` (câble USB, pas de forfait
// data ni d'IP réseau à connaître) — voir README.md.
// Expo remplace `process.env.EXPO_PUBLIC_*` par sa valeur au build. Build de production :
//   EXPO_PUBLIC_API_URL=https://api.hotelsaver.com (voir .env.example).
const API_URL_COMPILATION: string = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";

// Projet Supabase intégré au build (17/10/2026) : « Hotelsaver Test » par défaut (développement). Build publié :
// EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY du projet « Hotelsaver Prod » (voir .env.example).
const SUPABASE_TEST_URL = "https://glkmhesvmbxmryowbhkr.supabase.co";
const SUPABASE_TEST_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdsa21oZXN2bWJ4bXJ5b3diaGtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyNjkzMTgsImV4cCI6MjEwNzg0NTMxOH0.b-jVA2ElhxO_1uUblGRhFbZmLCx2XBXM_61SGQ2avpo";

const VALEURS_PAR_DEFAUT: ConfigurationApp = {
  apiUrl: API_URL_COMPILATION,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || SUPABASE_TEST_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_TEST_ANON_KEY,
};

export async function lireConfiguration(): Promise<ConfigurationApp> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    // L'API et le projet Supabase viennent TOUJOURS du build : une valeur mémorisée (ancien écran Paramètres, ancien
    // projet Supabase) ne doit pas masquer celle de la version installée.
    return brut
      ? {
          ...VALEURS_PAR_DEFAUT,
          ...JSON.parse(brut),
          apiUrl: API_URL_COMPILATION,
          supabaseUrl: VALEURS_PAR_DEFAUT.supabaseUrl,
          supabaseAnonKey: VALEURS_PAR_DEFAUT.supabaseAnonKey,
        }
      : VALEURS_PAR_DEFAUT;
  } catch {
    return VALEURS_PAR_DEFAUT;
  }
}

export async function ecrireConfiguration(partielle: Partial<ConfigurationApp>): Promise<ConfigurationApp> {
  const nouvelle = { ...(await lireConfiguration()), ...partielle };
  await AsyncStorage.setItem(CLE, JSON.stringify(nouvelle));
  return nouvelle;
}
