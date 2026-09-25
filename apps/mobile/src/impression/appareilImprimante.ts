import AsyncStorage from "@react-native-async-storage/async-storage";

/** Imprimante Bluetooth mémorisée (adresse MAC + nom d'affichage) — même
 * principe que `stockage/configuration.ts`, une seule imprimante à la fois
 * suffit pour cette passe (pas de multi-imprimante par écran). */
export interface AppareilImprimante {
  address: string;
  nom: string;
}

const CLE = "hotel-chicago:imprimante";

export async function lireAppareilImprimante(): Promise<AppareilImprimante | null> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

export async function ecrireAppareilImprimante(appareil: AppareilImprimante | null): Promise<void> {
  if (appareil) {
    await AsyncStorage.setItem(CLE, JSON.stringify(appareil));
  } else {
    await AsyncStorage.removeItem(CLE);
  }
}
