import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * « Payer mon abonnement maintenant » choisi à l'inscription : le téléphone s'en souvient jusqu'à la première ouverture de l'application par le
 * patron (qui peut devoir confirmer son e-mail d'abord), puis ouvre l'écran Abonnement UNE fois. Simple repère local sans effet sur la sécurité :
 * le perdre ne fait que ne pas ouvrir l'écran (le patron le trouve dans « Plus › Abonnement »).
 */
const CLE = "hotelsaver.payerMaintenant";

export async function memoriserPayerMaintenant(): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE, "1");
  } catch {
    // Stockage indisponible : sans conséquence.
  }
}

/** Vrai UNE seule fois après le choix « payer maintenant » (le repère est effacé en le lisant). */
export async function consommerPayerMaintenant(): Promise<boolean> {
  try {
    if ((await AsyncStorage.getItem(CLE)) !== "1") return false;
    await AsyncStorage.removeItem(CLE);
    return true;
  } catch {
    return false;
  }
}
