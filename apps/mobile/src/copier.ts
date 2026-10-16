import { Share } from "react-native";

/**
 * Met un texte à la disposition du téléphone (numéro à coller dans une autre application) : ouvre la feuille « Partager » d'Android, où « Copier »
 * est proposé en premier. Pas de module presse-papiers dans l'application ; l'appui long sur un texte `selectable` copie aussi.
 * Renvoie false si la feuille n'a pas pu s'ouvrir.
 */
export async function copierTexte(texte: string): Promise<boolean> {
  try {
    await Share.share({ message: texte });
    return true;
  } catch {
    return false;
  }
}
