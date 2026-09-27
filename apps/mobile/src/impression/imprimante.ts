import { Buffer } from "buffer";
import { PermissionsAndroid, Platform } from "react-native";
import RNBluetoothClassic, { BluetoothDevice } from "react-native-bluetooth-classic";
import { genererCommandesEscPos, LigneRecu } from "@hotel-chicago/receipts";
import { AppareilImprimante, lireAppareilImprimante } from "./appareilImprimante";

/** Android 12+ (API 31+) traite BLUETOOTH_CONNECT/BLUETOOTH_SCAN comme des
 * permissions dangereuses à demander à l'exécution — la déclaration dans le
 * manifeste (fournie par `react-native-bluetooth-classic` lui-même) ne
 * suffit pas, sans quoi le module natif lève une exception dès le premier
 * appel. Sur Android < 12, ces permissions sont "normales" (accordées à
 * l'installation), donc rien à demander. */
async function assurerPermissionsBluetooth(): Promise<void> {
  if (Platform.OS !== "android" || Platform.Version < 31) return;
  const resultats = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  ]);
  const refusee = Object.values(resultats).some((r) => r !== PermissionsAndroid.RESULTS.GRANTED);
  if (refusee) {
    throw new Error("Permission Bluetooth refusée — autorisez-la dans les réglages du téléphone (Applications > Hôtel Chicago > Autorisations).");
  }
}

/**
 * Transport SPP Bluetooth Classic pour l'ESC/POS — voir le plan
 * (`react-native-bluetooth-classic` juste comme tuyau, tout le formatage
 * vient de `genererCommandesEscPos`). Android exige un appairage au niveau
 * système au préalable : pas de découverte/appairage géré ici, seulement la
 * liste des appareils déjà appairés.
 */
export async function listerAppareilsAppaires(): Promise<AppareilImprimante[]> {
  await assurerPermissionsBluetooth();
  const active = await RNBluetoothClassic.isBluetoothEnabled();
  if (!active) {
    throw new Error("Le Bluetooth du téléphone est désactivé.");
  }
  const appareils = await RNBluetoothClassic.getBondedDevices();
  return appareils.map((a) => ({ address: a.address, nom: a.name || a.address }));
}

async function connecter(address: string): Promise<BluetoothDevice> {
  const dejaConnecte = await RNBluetoothClassic.isDeviceConnected(address).catch(() => false);
  if (dejaConnecte) {
    return RNBluetoothClassic.getConnectedDevice(address);
  }
  return RNBluetoothClassic.connectToDevice(address);
}

function attendre(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function envoyer(address: string, octets: Uint8Array): Promise<void> {
  await assurerPermissionsBluetooth();
  const device = await connecter(address);
  try {
    await device.write(Buffer.from(octets));
    // `write` se termine dès que les octets sont remis au socket Bluetooth,
    // pas une fois réellement transmis à l'imprimante — un `disconnect()`
    // immédiat coupe souvent la fin du ticket avant qu'elle ne parte
    // vraiment (constaté sur imprimante réelle : le ticket ne sortait pas
    // du tout malgré un `write` résolu avec succès).
    await attendre(800);
  } finally {
    await device.disconnect().catch(() => {});
  }
}

/** Imprime un reçu déjà construit (`construireRecuFacture`/`construireRecuVente`)
 * sur l'imprimante mémorisée dans Paramètres. */
export async function imprimerLignes(lignes: LigneRecu[]): Promise<void> {
  const appareil = await lireAppareilImprimante();
  if (!appareil) {
    throw new Error("Aucune imprimante configurée — réglez-la depuis Plus > Imprimante.");
  }
  await envoyer(appareil.address, genererCommandesEscPos(lignes));
}

/** Ticket de test envoyé directement à une adresse (pas forcément celle déjà
 * mémorisée, pour pouvoir tester avant d'enregistrer). */
export async function imprimerTicketDeTest(address: string): Promise<void> {
  const lignes: LigneRecu[] = [
    { type: "titre", texte: "HOTEL CHICAGO" },
    { type: "soustitre", texte: "Ticket de test" },
    { type: "separateur" },
    { type: "champ", label: "Imprimante", valeur: "Connexion OK" },
  ];
  await envoyer(address, genererCommandesEscPos(lignes));
}
