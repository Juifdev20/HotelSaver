import { app, safeStorage } from "electron";
import { randomBytes } from "crypto";
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

/**
 * Le fichier de configuration contient le jeton de renouvellement de session, l'empreinte des mots de passe et le profil des comptes du poste :
 * il est chiffré avec le coffre du système (`safeStorage` : DPAPI sous Windows, la clé reste liée à la session Windows de l'utilisateur).
 * Un ancien fichier en clair est relu tel quel puis réécrit chiffré à la prochaine écriture. Si le coffre n'est pas disponible
 * (poste sans session, tests), le fichier reste en clair mais lisible par son propriétaire seulement.
 */
interface EnveloppeChiffree {
  v: 1;
  chiffre: string;
}

function lireJson(chemin: string): Record<string, unknown> | null {
  const brut = readFileSync(chemin);
  const texte = brut.toString("utf-8");
  const json = JSON.parse(texte) as Record<string, unknown> & Partial<EnveloppeChiffree>;
  if (json.v === 1 && typeof json.chiffre === "string") {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return JSON.parse(safeStorage.decryptString(Buffer.from(json.chiffre, "base64"))) as Record<string, unknown>;
  }
  return json;
}

function ecrireJson(chemin: string, valeur: Record<string, unknown>): void {
  const texte = JSON.stringify(valeur, null, 2);
  if (safeStorage.isEncryptionAvailable()) {
    const enveloppe: EnveloppeChiffree = { v: 1, chiffre: safeStorage.encryptString(texte).toString("base64") };
    writeFileSync(chemin, JSON.stringify(enveloppe), { encoding: "utf-8", mode: 0o600 });
  } else {
    writeFileSync(chemin, texte, { encoding: "utf-8", mode: 0o600 });
  }
}

function lireBrut(): Record<string, unknown> {
  const chemin = cheminFichierConfiguration();
  if (!existsSync(chemin)) return {};
  try {
    return lireJson(chemin) ?? {};
  } catch {
    return {};
  }
}

export function lireConfiguration(): ConfigurationApp {
  const { cleLocale: _cle, ...contenu } = lireBrut();
  void _cle; // la clé de chiffrement de la copie locale ne sort jamais vers l'interface par cette voie
  // L'adresse de l'API vient TOUJOURS du build : un `apiUrl` resté dans un ancien configuration.json (du temps où l'écran Paramètres la
  // proposait) ne doit pas masquer celle de la version installée. Idem pour Supabase.
  return {
    ...VALEURS_PAR_DEFAUT,
    ...contenu,
    apiUrl: API_URL_COMPILATION,
    supabaseUrl: VALEURS_PAR_DEFAUT.supabaseUrl,
    supabaseAnonKey: VALEURS_PAR_DEFAUT.supabaseAnonKey,
  } as ConfigurationApp;
}

/**
 * Clé de chiffrement de la copie locale des données de l'hôtel (IndexedDB du bureau). Générée une fois, gardée dans la configuration
 * (donc protégée par le coffre du système). Le renderer ne la reçoit qu'en mémoire, par un canal dédié.
 */
export function cleChiffrementLocale(): string {
  const brut = lireBrut();
  if (typeof brut.cleLocale === "string") return brut.cleLocale;
  const cle = randomBytes(32).toString("base64");
  ecrireJson(cheminFichierConfiguration(), { ...brut, cleLocale: cle });
  return cle;
}

/** Seules ces clés peuvent être écrites depuis l'interface. L'adresse de l'API et les paramètres Supabase viennent TOUJOURS du build :
 * sinon une page compromise pourrait pointer l'application vers un faux serveur de connexion. */
const CLES_ECRITES_PAR_L_INTERFACE = ["refreshToken", "imprimanteInterface", "comptesLocaux", "compteActif"] as const;

/** `tcp://hôte:port`, port série Windows (`COM5`, `\\\\.\\COM5`) ou périphérique Linux (`/dev/usb/lp0`, `/dev/ttyUSB0`, `/dev/rfcomm0`). */
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
  // On réécrit à partir du contenu brut pour conserver la clé de chiffrement de la copie locale.
  ecrireJson(cheminFichierConfiguration(), { ...lireBrut(), ...autorisee });
  return lireConfiguration();
}
