import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Identifiant aléatoire de ce téléphone (18/10/2026), envoyé à l'inscription d'un hôtel (en-tête X-Appareil) : la limite
 * d'inscriptions par jour vaut ainsi par appareil, pas seulement par adresse internet. Aucune donnée personnelle — un simple tirage
 * gardé sur le téléphone. En cas de souci de stockage : null, l'inscription se fait quand même (limite par adresse seule).
 */
const CLE = "hotelsaver:identifiant-appareil";

function tirage(): string {
  let id = "";
  while (id.length < 32) id += Math.random().toString(36).slice(2);
  return id.slice(0, 32);
}

export async function identifiantAppareil(): Promise<string | null> {
  try {
    let id = await AsyncStorage.getItem(CLE);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = tirage();
      await AsyncStorage.setItem(CLE, id);
    }
    return id;
  } catch {
    return null;
  }
}
