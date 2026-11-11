import AsyncStorage from "@react-native-async-storage/async-storage";
import { preferenceValide, type PreferenceApparence } from "@hotel-chicago/regles";

/** Apparence choisie sur CET appareil (Auto / Clair / Sombre) : propre à la personne qui tient le téléphone, jamais envoyée au serveur. Défaut : Auto. */
const CLE = "hotel-chicago:apparence";

export async function lireApparence(): Promise<PreferenceApparence> {
  try {
    return preferenceValide(await AsyncStorage.getItem(CLE));
  } catch {
    return "auto";
  }
}

export async function ecrireApparence(preference: PreferenceApparence): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE, preference);
  } catch {
    // Le choix s'applique quand même pour cette séance ; il ne sera simplement pas retenu au prochain lancement.
  }
}
