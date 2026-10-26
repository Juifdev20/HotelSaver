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

/**
 * Comment les tickets partent :
 * - « bluetooth » : directement de HotelSaver vers l'imprimante appairée (par défaut) ;
 * - « rawbt » : HotelSaver confie le ticket à l'application gratuite RawBT, qui gère elle-même la connexion (Bluetooth classique,
 *   Bluetooth basse consommation, USB). Solution de secours pour les imprimantes qui refusent la connexion directe.
 */
export type ModeImpression = "bluetooth" | "rawbt";

const CLE_MODE = "hotel-chicago:imprimante-mode";

export async function lireModeImpression(): Promise<ModeImpression> {
  try {
    return (await AsyncStorage.getItem(CLE_MODE)) === "rawbt" ? "rawbt" : "bluetooth";
  } catch {
    return "bluetooth";
  }
}

export async function ecrireModeImpression(mode: ModeImpression): Promise<void> {
  await AsyncStorage.setItem(CLE_MODE, mode);
}
