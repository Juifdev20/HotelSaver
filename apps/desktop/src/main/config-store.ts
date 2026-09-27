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
  /** Connexion imprimante ESC/POS (section 11) — `tcp://ip:port` ou un
   * chemin de périphérique brut (`\\.\COM5`, `/dev/usb/lp0`), voir
   * `main/imprimante.ts`. `null` tant qu'aucune imprimante n'est configurée. */
  imprimanteInterface: string | null;
}

const VALEURS_PAR_DEFAUT: ConfigurationApp = {
  apiUrl: "http://localhost:3001",
  supabaseUrl: "https://zjplcqocmkctbfxnxheq.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqcGxjcW9jbWtjdGJmeG54aGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NTg0MzgsImV4cCI6MjEwNjAzNDQzOH0.fkgb9UjnDKQ956wWrv73EAGbBcJly_NrfS-pwKibMSI",
  refreshToken: null,
  imprimanteInterface: null,
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
