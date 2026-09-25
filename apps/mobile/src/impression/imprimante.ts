import { Buffer } from "buffer";
import RNBluetoothClassic, { BluetoothDevice } from "react-native-bluetooth-classic";
import { genererCommandesEscPos, LigneRecu } from "@hotel-chicago/receipts";
import { AppareilImprimante, lireAppareilImprimante } from "./appareilImprimante";

/**
 * Transport SPP Bluetooth Classic pour l'ESC/POS — voir le plan
 * (`react-native-bluetooth-classic` juste comme tuyau, tout le formatage
 * vient de `genererCommandesEscPos`). Android exige un appairage au niveau
 * système au préalable : pas de découverte/appairage géré ici, seulement la
 * liste des appareils déjà appairés.
 */
export async function listerAppareilsAppaires(): Promise<AppareilImprimante[]> {
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

async function envoyer(address: string, octets: Uint8Array): Promise<void> {
  const device = await connecter(address);
  try {
    await device.write(Buffer.from(octets));
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
