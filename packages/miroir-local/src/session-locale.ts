/**
 * Travailler sans connexion implique aussi de pouvoir OUVRIR l'application sans connexion — sans pour autant laisser n'importe qui
 * y entrer pour toujours. Règles :
 *  - un compte déjà connecté sur ce poste peut se reconnecter hors ligne avec son mot de passe, vérifié contre une empreinte
 *    locale (PBKDF2 salé, jamais le mot de passe lui-même) ;
 *  - tant que le poste n'a pas parlé au serveur depuis moins de DELAI_GRACE_JOURS, le travail hors ligne est permis ; au-delà il faut
 *    se reconnecter (le serveur a pu suspendre la licence ou désactiver le compte entre-temps) ;
 *  - l'heure de l'appareil ne peut pas servir à gagner du temps : l'horloge utilisée ne recule jamais (on retient la plus grande heure vue).
 */
import type { ProfilConnecte } from "@hotel-chicago/types";

export const DELAI_GRACE_JOURS = 14;
const JOUR_MS = 86_400_000;
/** Recommandation OWASP pour PBKDF2-SHA256 (2023). Une empreinte plus ancienne est recalculée à la prochaine connexion réussie. */
export const ITERATIONS_RECOMMANDEES = 600_000;
const ITERATIONS_PAR_DEFAUT = ITERATIONS_RECOMMANDEES;

export const verificateurObsolete = (v: VerificateurMotDePasse): boolean => v.iterations < ITERATIONS_RECOMMANDEES;

export interface VerificateurMotDePasse {
  sel: string;
  hash: string;
  iterations: number;
}

export interface CompteLocal {
  /** Adresse e-mail en minuscules : clé du compte sur ce poste. */
  email: string;
  verificateur: VerificateurMotDePasse;
  /** Dernier profil reçu du serveur (rôle, hôtel, réglages, licence). */
  profil: ProfilConnecte;
  /** Jeton de renouvellement de la dernière session en ligne : permet de retrouver l'accès au serveur au retour du réseau. */
  refreshToken: string | null;
  /** Dernier contact réussi avec le serveur, à l'heure du SERVEUR (ISO). */
  verifieLe: string;
  /** Plus grande heure d'appareil vue depuis ce contact (ISO) : l'horloge utilisée pour la grâce ne recule jamais. */
  heureMax: string;
  /** Choix de l'utilisateur sur ce poste (jamais imposés, sauf le mot de passe au lancement du patron, qu'il peut retirer). */
  preferences?: PreferencesSession;
  /** Tentatives hors ligne ratées : conservées sur disque, donc redémarrer l'application ne remet pas le compteur à zéro. */
  echecs?: { nombre: number; blocageJusquau: string | null; blocages: number };
}

export interface PreferencesSession {
  /** Redemander le mot de passe à chaque lancement de l'application. Par défaut : oui pour le patron (finances), non pour le personnel. */
  verrouLancement?: boolean;
  /** Verrouiller après N minutes sans activité. Désactivé par défaut (null) : l'application reste ouverte tant que l'utilisateur ne choisit pas. */
  inactiviteMinutes?: number | null;
}

export type DecisionAcces =
  | { autorise: true; joursRestants: number; enGrace: boolean }
  | { autorise: false; raison: "licence" | "delai"; message: string };

export const cleCompte = (email: string) => email.trim().toLowerCase();

// ---------------------------------------------------------------------------------------------- empreinte du mot de passe


function versBase64(octets: Uint8Array): string {
  let binaire = "";
  octets.forEach((o) => (binaire += String.fromCharCode(o)));
  return btoa(binaire);
}

function depuisBase64(texte: string): Uint8Array {
  return Uint8Array.from(atob(texte), (c) => c.charCodeAt(0));
}

async function deriver(email: string, motDePasse: string, sel: Uint8Array, iterations: number): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Chiffrement indisponible sur cet appareil.");
  // L'e-mail fait partie de la donnée dérivée : deux comptes ayant le même mot de passe n'ont pas la même empreinte.
  const cle = await subtle.importKey("raw", new TextEncoder().encode(`${cleCompte(email)}\u0000${motDePasse}`), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sel as BufferSource, iterations }, cle, 256);
  return new Uint8Array(bits);
}

export async function creerVerificateur(email: string, motDePasse: string, iterations = ITERATIONS_PAR_DEFAUT): Promise<VerificateurMotDePasse> {
  const sel = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return { sel: versBase64(sel), hash: versBase64(await deriver(email, motDePasse, sel, iterations)), iterations };
}

export async function verifierMotDePasse(email: string, motDePasse: string, v: VerificateurMotDePasse): Promise<boolean> {
  const calcule = await deriver(email, motDePasse, depuisBase64(v.sel), v.iterations);
  const attendu = depuisBase64(v.hash);
  if (calcule.length !== attendu.length) return false;
  let difference = 0;
  for (let i = 0; i < calcule.length; i++) difference |= calcule[i] ^ attendu[i]; // temps constant
  return difference === 0;
}

// ---------------------------------------------------------------------------------------------- durée de grâce

/** Mémorise un contact réussi avec le serveur. `serveurLe` : heure du serveur (jamais celle de l'appareil si on la connaît). */
export function memoriserContact(
  existant: Pick<CompteLocal, "email" | "verificateur"> & Partial<CompteLocal>,
  profil: ProfilConnecte,
  refreshToken: string | null,
  serveurLe: Date
): CompteLocal {
  return {
    email: existant.email,
    verificateur: existant.verificateur,
    profil,
    refreshToken: refreshToken ?? existant.refreshToken ?? null,
    verifieLe: serveurLe.toISOString(),
    heureMax: serveurLe.toISOString(),
    preferences: existant.preferences,
    echecs: undefined, // un contact réussi avec le serveur remet les tentatives à zéro
  };
}

/** Fait avancer la plus grande heure vue (à appeler à l'ouverture et régulièrement hors ligne). */
export function avancerHorloge(compte: CompteLocal, maintenant: Date): CompteLocal {
  return maintenant.toISOString() > compte.heureMax ? { ...compte, heureMax: maintenant.toISOString() } : compte;
}

export function evaluerAcces(compte: Pick<CompteLocal, "profil" | "verifieLe" | "heureMax">, maintenant: Date, graceJours = DELAI_GRACE_JOURS): DecisionAcces {
  const statut = compte.profil.statutLicence;
  if (statut === "SUSPENDU" || statut === "RESILIE") {
    return { autorise: false, raison: "licence", message: "La licence de cet hôtel est suspendue. Connectez-vous à Internet pour vérifier votre situation." };
  }
  const effectif = Math.max(maintenant.getTime(), Date.parse(compte.heureMax));
  const ecoule = effectif - Date.parse(compte.verifieLe);
  const restant = graceJours * JOUR_MS - ecoule;
  if (restant <= 0) {
    return {
      autorise: false,
      raison: "delai",
      message: `Cet appareil n'a pas été connecté à Internet depuis plus de ${graceJours} jours. Connectez-le pour vérifier votre licence et envoyer vos données, puis vous pourrez de nouveau travailler hors ligne.`,
    };
  }
  return { autorise: true, joursRestants: Math.ceil(restant / JOUR_MS), enGrace: ecoule > 0 };
}
