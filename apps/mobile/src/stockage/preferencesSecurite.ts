import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Réglages de sécurité choisis par l'utilisateur sur cet appareil. TOUT est facultatif et désactivé par défaut
 * (décision du patron 10/10/2026) : une application trop verrouillée décourage les utilisateurs peu à l'aise.
 */
export interface PreferencesSecurite {
  /** Minutes passées hors de l'application avant de redemander le mot de passe ; null = jamais (défaut). */
  inactiviteMinutes: number | null;
}

const CLE = "hotel-chicago:preferences-securite";
export const CHOIX_INACTIVITE: { minutes: number | null; libelle: string }[] = [
  { minutes: null, libelle: "Jamais" },
  { minutes: 5, libelle: "5 min" },
  { minutes: 15, libelle: "15 min" },
  { minutes: 60, libelle: "1 h" },
];

export async function lirePreferencesSecurite(): Promise<PreferencesSecurite> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    const valeur = brut ? JSON.parse(brut)?.inactiviteMinutes : null;
    return { inactiviteMinutes: CHOIX_INACTIVITE.some((c) => c.minutes === valeur) ? valeur : null };
  } catch {
    return { inactiviteMinutes: null };
  }
}

export async function ecrirePreferencesSecurite(preferences: PreferencesSecurite): Promise<void> {
  await AsyncStorage.setItem(CLE, JSON.stringify(preferences));
}
