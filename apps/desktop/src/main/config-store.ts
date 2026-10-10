import { app } from "electron";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface ConfigurationApp {
  /** Fixée à la compilation (`MAIN_VITE_API_URL`) : aucun écran ne la propose, un utilisateur
   * n'a pas à manipuler une adresse technique (DECISIONS.md, 01/10/2026). */
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
  /** Comptes déjà connectés sur ce poste (empreinte du mot de passe, dernier profil, jeton de renouvellement) : permettent d'ouvrir
   * l'application sans connexion Internet. Géré par GestionnaireSession (@hotel-chicago/miroir-local). */
  comptesLocaux: Record<string, unknown>;
  /** E-mail du compte à rouvrir au prochain lancement ; null après une déconnexion. */
  compteActif: string | null;
}

/** Adresse de l'API intégrée au build. En développement : le serveur local. Pour un
 * build de production, la définir avant la compilation :
 *   MAIN_VITE_API_URL=https://api.hotelsaver.com pnpm --filter desktop build */
const API_URL_COMPILATION: string = import.meta.env.MAIN_VITE_API_URL || "http://localhost:3001";

const VALEURS_PAR_DEFAUT: ConfigurationApp = {
  apiUrl: API_URL_COMPILATION,
  supabaseUrl: "https://zjplcqocmkctbfxnxheq.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqcGxjcW9jbWtjdGJmeG54aGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NTg0MzgsImV4cCI6MjEwNjAzNDQzOH0.fkgb9UjnDKQ956wWrv73EAGbBcJly_NrfS-pwKibMSI",
  refreshToken: null,
  imprimanteInterface: null,
  comptesLocaux: {},
  compteActif: null,
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
    // L'adresse de l'API vient TOUJOURS du build : un `apiUrl` resté dans un ancien
    // configuration.json (du temps où l'écran Paramètres la proposait) ne doit pas
    // masquer celle de la version installée.
    return { ...VALEURS_PAR_DEFAUT, ...JSON.parse(readFileSync(chemin, "utf-8")), apiUrl: API_URL_COMPILATION };
  } catch {
    return VALEURS_PAR_DEFAUT;
  }
}

/** Seules ces clés peuvent être écrites depuis l'interface. L'adresse de l'API et les paramètres Supabase viennent TOUJOURS du build :
 * sinon une page compromise pourrait pointer l'application vers un faux serveur de connexion. */
const CLES_ECRITES_PAR_L_INTERFACE = ["refreshToken", "imprimanteInterface", "comptesLocaux", "compteActif"] as const;

/** `tcp://hôte:port`, port série Windows (`COM5`, `\\.\COM5`) ou périphérique Linux (`/dev/usb/lp0`, `/dev/ttyUSB0`, `/dev/rfcomm0`). */
const INTERFACE_IMPRIMANTE_VALIDE = /^(tcp:\/\/[A-Za-z0-9.-]{1,253}:\d{1,5}|(\\\\\.\\)?COM\d{1,3}|\/dev\/(usb\/lp|ttyUSB|ttyS|ttyACM|rfcomm)\d{1,2})$/;

export function interfaceImprimanteValide(valeur: unknown): valeur is string {
  return typeof valeur === "string" && INTERFACE_IMPRIMANTE_VALIDE.test(valeur.trim());
}

export function ecrireConfiguration(partielle: Partial<ConfigurationApp>): ConfigurationApp {
  const autorisee: Partial<ConfigurationApp> = {};
  for (const cle of CLES_ECRITES_PAR_L_INTERFACE) {
    if (partielle && cle in partielle) (autorisee as Record<string, unknown>)[cle] = (partielle as Record<string, unknown>)[cle];
  }
  if (autorisee.imprimanteInterface != null && !interfaceImprimanteValide(autorisee.imprimanteInterface)) {
    throw new Error("Adresse d'imprimante invalide. Exemples : tcp://192.168.1.50:9100 ou COM5.");
  }
  const nouvelle = { ...lireConfiguration(), ...autorisee };
  writeFileSync(cheminFichierConfiguration(), JSON.stringify(nouvelle, null, 2), "utf-8");
  return nouvelle;
}
