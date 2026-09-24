import { app } from "electron";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface ConfigurationApp {
  /** Modifiable depuis l'écran Paramètres sans recompiler (section 6). */
  apiUrl: string;
  supabaseUrl: string;
  /** Clé anonyme Supabase — publique par conception, jamais la clé service_role. */
  supabaseAnonKey: string;
  /** Jeton de rafraîchissement Supabase, pour rester connecté entre deux
   * lancements de l'app (section 14 : "reste connecté en permanence"). */
  refreshToken: string | null;
}

const VALEURS_PAR_DEFAUT: ConfigurationApp = {
  apiUrl: "http://localhost:3000",
  supabaseUrl: "https://krvhnsyvlkgvcxncvwkx.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtydmhuc3l2bGtndmN4bmN2d2t4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDI1NjYsImV4cCI6MjEwNTgxODU2Nn0.7hIYhQG8M1qEDIJZENRgR9gxAyUW1q9DmuSRqiYX__Y",
  refreshToken: null,
};

function cheminFichierConfiguration(): string {
  return join(app.getPath("userData"), "configuration.json");
}

export function lireConfiguration(): ConfigurationApp {
  const chemin = cheminFichierConfiguration();
  if (!existsSync(chemin)) {
    return VALEURS_PAR_DEFAUT;
  }
  try {
    return { ...VALEURS_PAR_DEFAUT, ...JSON.parse(readFileSync(chemin, "utf-8")) };
  } catch {
    return VALEURS_PAR_DEFAUT;
  }
}

export function ecrireConfiguration(partielle: Partial<ConfigurationApp>): ConfigurationApp {
  const nouvelle = { ...lireConfiguration(), ...partielle };
  writeFileSync(cheminFichierConfiguration(), JSON.stringify(nouvelle, null, 2), "utf-8");
  return nouvelle;
}
