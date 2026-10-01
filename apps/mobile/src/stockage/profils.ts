import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { ProfilConnecte, Role } from "@hotel-chicago/types";

/**
 * Section 5 : "sélection de profil au démarrage" — un même téléphone est
 * partagé par plusieurs membres du personnel. On garde donc en local la
 * liste des comptes déjà connectés sur cet appareil (nom/rôle/email, pas
 * sensible → AsyncStorage), et séparément le jeton de rafraîchissement de
 * chacun (sensible → expo-secure-store, chiffré par l'OS). Jamais le mot de
 * passe lui-même, jamais stocké nulle part côté client.
 */
export interface ProfilEnregistre {
  utilisateurId: string;
  nom: string;
  role: Role;
  email: string;
}

const CLE_PROFILS = "hotel-chicago:profils";
const CLE_JETON = (utilisateurId: string) => `hotel-chicago-jeton-${utilisateurId}`;
const CLE_DERNIER_UTILISATEUR = "hotel-chicago:dernier-utilisateur";
const CLE_PROFIL_CACHE = (utilisateurId: string) => `hotel-chicago:profil-cache:${utilisateurId}`;

export async function listerProfils(): Promise<ProfilEnregistre[]> {
  try {
    const brut = await AsyncStorage.getItem(CLE_PROFILS);
    return brut ? JSON.parse(brut) : [];
  } catch {
    return [];
  }
}

/** Ajoute le profil s'il est nouveau, ou met à jour nom/rôle s'il a changé côté serveur. */
export async function enregistrerProfil(profil: ProfilEnregistre): Promise<void> {
  const profils = await listerProfils();
  const sansCelui = profils.filter((p) => p.utilisateurId !== profil.utilisateurId);
  await AsyncStorage.setItem(CLE_PROFILS, JSON.stringify([...sansCelui, profil]));
}

/** Retire le profil de la liste et son jeton — utilisé pour "Oublier ce compte" et à la déconnexion explicite. */
export async function oublierProfil(utilisateurId: string): Promise<void> {
  const profils = await listerProfils();
  await AsyncStorage.setItem(CLE_PROFILS, JSON.stringify(profils.filter((p) => p.utilisateurId !== utilisateurId)));
  await SecureStore.deleteItemAsync(CLE_JETON(utilisateurId)).catch(() => {});
  await AsyncStorage.removeItem(CLE_PROFIL_CACHE(utilisateurId)).catch(() => {});
}

/**
 * Copie locale du profil complet (nom, rôle, hôtel, réglages…) : permet d'ouvrir l'application TOUT DE SUITE
 * au démarrage, sans attendre le réseau — le profil et le jeton sont renouvelés en arrière-plan. Aucune donnée
 * sensible (le jeton reste dans le coffre chiffré) ; le serveur reste juge de chaque action.
 */
export async function ecrireProfilCache(utilisateurId: string, profil: ProfilConnecte): Promise<void> {
  await AsyncStorage.setItem(CLE_PROFIL_CACHE(utilisateurId), JSON.stringify(profil)).catch(() => {});
}

export async function lireProfilCache(utilisateurId: string): Promise<ProfilConnecte | null> {
  try {
    const brut = await AsyncStorage.getItem(CLE_PROFIL_CACHE(utilisateurId));
    return brut ? (JSON.parse(brut) as ProfilConnecte) : null;
  } catch {
    return null;
  }
}

export async function lireJetonRafraichissement(utilisateurId: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CLE_JETON(utilisateurId));
  } catch {
    return null;
  }
}

export async function ecrireJetonRafraichissement(utilisateurId: string, jeton: string): Promise<void> {
  await SecureStore.setItemAsync(CLE_JETON(utilisateurId), jeton);
}

export async function ecrireDernierUtilisateur(utilisateurId: string): Promise<void> {
  await AsyncStorage.setItem(CLE_DERNIER_UTILISATEUR, utilisateurId);
}

export async function lireDernierUtilisateur(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CLE_DERNIER_UTILISATEUR);
  } catch {
    return null;
  }
}
