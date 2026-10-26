import { Buffer } from "buffer";
import { Linking, PermissionsAndroid, Platform } from "react-native";
import RNBluetoothClassic, { BluetoothDevice } from "react-native-bluetooth-classic";
import { COLONNES_PAR_LARGEUR, construireTicketDeTest, EnteteHotel, genererCommandesEscPos, LigneRecu, ressembleAImprimante } from "@hotel-chicago/receipts";
import { AppareilImprimante, lireAppareilImprimante, lireLargeurPapier, lireModeImpression } from "./appareilImprimante";

/** Android 12+ (API 31+) traite BLUETOOTH_CONNECT/BLUETOOTH_SCAN comme des
 * permissions dangereuses à demander à l'exécution — la déclaration dans le
 * manifeste (fournie par `react-native-bluetooth-classic` lui-même) ne
 * suffit pas, sans quoi le module natif lève une exception dès le premier
 * appel. Sur Android < 12, ces permissions sont "normales" (accordées à
 * l'installation) ; seule la recherche d'appareils demande alors la
 * localisation (règle d'Android, rien n'est localisé). */
async function assurerPermissionsBluetooth(pourRecherche = false): Promise<void> {
  if (Platform.OS !== "android") return;
  if (Platform.Version >= 31) {
    const resultats = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ]);
    const refusee = Object.values(resultats).some((r) => r !== PermissionsAndroid.RESULTS.GRANTED);
    if (refusee) {
      throw new Error("Permission Bluetooth refusée : sans elle, l'imprimante est introuvable. Autorisez-la dans les réglages du téléphone (Applications > HotelSaver > Autorisations).");
    }
    return;
  }
  if (pourRecherche) {
    const localisation = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    if (localisation !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error(
        "Android demande l'autorisation « Localisation » pour chercher des appareils Bluetooth (HotelSaver ne vous localise pas). Autorisez-la, ou appairez l'imprimante depuis les réglages Bluetooth du téléphone."
      );
    }
  }
}

function attendre(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Active le Bluetooth du téléphone en demandant simplement « Autoriser ? » à l'utilisateur, sans le renvoyer dans les réglages. */
export async function activerBluetooth(): Promise<boolean> {
  await assurerPermissionsBluetooth();
  if (await RNBluetoothClassic.isBluetoothEnabled()) return true;
  try {
    return await RNBluetoothClassic.requestBluetoothEnabled();
  } catch {
    return false;
  }
}

async function exigerBluetoothActif(): Promise<void> {
  const actif = await activerBluetooth();
  if (!actif) {
    throw new Error("Le Bluetooth du téléphone est désactivé : activez-le pour retrouver votre imprimante, puis touchez « Actualiser ».");
  }
}

/**
 * Transport SPP Bluetooth Classic pour l'ESC/POS — `react-native-bluetooth-classic` juste comme tuyau, tout le formatage
 * vient de `genererCommandesEscPos`. Liste les appareils déjà appairés au niveau du système Android.
 */
export async function listerAppareilsAppaires(): Promise<AppareilImprimante[]> {
  await exigerBluetoothActif();
  const appareils = await RNBluetoothClassic.getBondedDevices();
  return appareils.map((a) => ({ address: a.address, nom: a.name || a.address }));
}

/** Imprimante vue pendant la recherche ; `appairee` : déjà enregistrée dans le téléphone (donc prête à imprimer). */
export interface AppareilTrouve extends AppareilImprimante {
  appairee: boolean;
  /** Le nom évoque une imprimante de tickets (classement seulement : tous les appareils restent proposés, quelle que soit la marque). */
  probable: boolean;
}

/** Appairées d'abord, puis imprimantes probables, puis le reste par nom. */
function classer(appareils: AppareilTrouve[]): AppareilTrouve[] {
  const rang = (a: AppareilTrouve) => (a.probable ? 0 : 2) + (a.appairee ? 0 : 1);
  return [...appareils].sort((a, b) => rang(a) - rang(b) || a.nom.localeCompare(b.nom));
}

/**
 * Cherche les appareils Bluetooth autour du téléphone (≈ 12 s) et y ajoute ceux déjà appairés, pour que l'utilisateur voie toutes ses
 * imprimantes en une seule liste, sans passer par les réglages. `surTrouve` est appelé au fil de l'eau pour afficher les appareils
 * dès qu'ils apparaissent.
 */
export async function chercherAppareils(surTrouve: (appareils: AppareilTrouve[]) => void): Promise<AppareilTrouve[]> {
  await assurerPermissionsBluetooth(true);
  await exigerBluetoothActif();

  const par: Map<string, AppareilTrouve> = new Map();
  const publier = () => surTrouve(classer([...par.values()]));
  for (const a of await RNBluetoothClassic.getBondedDevices()) {
    par.set(a.address, { address: a.address, nom: a.name || a.address, appairee: true, probable: ressembleAImprimante(a.name ?? "") });
  }
  publier();

  const abonnement = RNBluetoothClassic.onDeviceDiscovered((evenement) => {
    const a = evenement.device;
    if (!a?.address || par.has(a.address)) return;
    par.set(a.address, { address: a.address, nom: a.name || a.address, appairee: false, probable: ressembleAImprimante(a.name ?? "") });
    publier();
  });
  try {
    await RNBluetoothClassic.cancelDiscovery().catch(() => false);
    await RNBluetoothClassic.startDiscovery();
  } catch (e) {
    // Une recherche refusée ne doit pas cacher les imprimantes déjà appairées : on les rend quand même.
    if (par.size === 0) throw e;
  } finally {
    abonnement.remove();
  }
  return classer([...par.values()]);
}

/** Appaire l'imprimante depuis l'application (le téléphone demande le code 0000 ou 1234 si l'imprimante en veut un). */
export async function appairerAppareil(address: string): Promise<void> {
  await assurerPermissionsBluetooth(true);
  await RNBluetoothClassic.cancelDiscovery().catch(() => false);
  try {
    await RNBluetoothClassic.pairDevice(address);
  } catch (e) {
    const detail = e instanceof Error && e.message ? ` (${e.message})` : "";
    throw new Error(
      `L'appairage n'a pas abouti : vérifiez que l'imprimante est allumée et proche, et saisissez le code 0000 ou 1234 si le téléphone le demande.${detail}`
    );
  }
}

/**
 * Connexion SPP robuste. Erreur réelle constatée (08/10/2026) : « read failed,
 * socket might closed or timeout, read ret: -1 » — beaucoup d'imprimantes
 * thermiques bon marché refusent la socket RFCOMM *sécurisée* (défaut de la
 * bibliothèque) ou ratent le premier essai ; d'autres ne répondent qu'après
 * une pause quand elles viennent de se réveiller. On arrête une éventuelle
 * recherche Bluetooth (elle fait échouer connect()), puis on alterne
 * sécurisée / non sécurisée avec des pauses de plus en plus longues.
 */
async function connecter(address: string): Promise<BluetoothDevice> {
  const dejaConnecte = await RNBluetoothClassic.isDeviceConnected(address).catch(() => false);
  if (dejaConnecte) {
    return RNBluetoothClassic.getConnectedDevice(address);
  }
  await RNBluetoothClassic.cancelDiscovery().catch(() => false);
  const essais: { secure: boolean; pauseAvant: number }[] = [
    { secure: true, pauseAvant: 0 },
    { secure: false, pauseAvant: 500 },
    { secure: true, pauseAvant: 1000 },
    { secure: false, pauseAvant: 2000 },
    { secure: false, pauseAvant: 3000 },
  ];
  let derniere: unknown = null;
  for (const essai of essais) {
    if (essai.pauseAvant) await attendre(essai.pauseAvant);
    try {
      return await RNBluetoothClassic.connectToDevice(address, { secure: essai.secure } as never);
    } catch (e) {
      derniere = e;
      // Une socket à moitié ouverte bloque l'essai suivant : on la libère.
      await RNBluetoothClassic.disconnectFromDevice(address).catch(() => false);
    }
  }
  const detail = derniere instanceof Error && derniere.message ? ` (${derniere.message})` : "";
  const appaires = await RNBluetoothClassic.getBondedDevices().catch(() => [] as BluetoothDevice[]);
  if (!appaires.some((a) => a.address === address)) {
    throw new Error("Cette imprimante n'est plus appairée au téléphone (elle a peut-être été réinitialisée) : choisissez-la de nouveau dans Plus > Imprimante pour la réappairer.");
  }
  throw new Error(
    "Impossible de joindre l'imprimante. 1) Vérifiez qu'elle est allumée et proche. 2) Déconnectez-la de tout autre téléphone ou ordinateur : " +
      "une imprimante Bluetooth ne parle qu'à un seul appareil à la fois. 3) Éteignez-la puis rallumez-la. " +
      `Si cela persiste, essayez le mode « Application RawBT » dans Plus > Imprimante.${detail}`
  );
}

/** Une seule impression à la fois : deux envois en même temps se disputent la liaison Bluetooth et échouent tous les deux. */
let impressionEnCours: Promise<unknown> = Promise.resolve();

function enFile<T>(travail: () => Promise<T>): Promise<T> {
  const suite = impressionEnCours.then(travail, travail);
  impressionEnCours = suite.catch(() => undefined);
  return suite;
}

async function envoyerParBluetooth(address: string, octets: Uint8Array): Promise<void> {
  await assurerPermissionsBluetooth();
  await exigerBluetoothActif();
  const device = await connecter(address);
  try {
    // Par blocs de 1 Ko avec une pause : une longue série d'étiquettes
    // (plus de limite de nombre, 08/10/2026) d'un seul bloc déborde la petite
    // mémoire des imprimantes bon marché, qui perdent alors la fin.
    const BLOC = 1024;
    for (let debut = 0; debut < octets.length; debut += BLOC) {
      await device.write(Buffer.from(octets.subarray(debut, debut + BLOC)));
      if (debut + BLOC < octets.length) await attendre(150);
    }
    // `write` se termine dès que les octets sont remis au socket Bluetooth,
    // pas une fois réellement transmis à l'imprimante — un `disconnect()`
    // immédiat coupe souvent la fin du ticket avant qu'elle ne parte
    // vraiment (constaté sur imprimante réelle : le ticket ne sortait pas
    // du tout malgré un `write` résolu avec succès).
    // ~1 ms pour 10 octets au-delà du minimum : une série d'étiquettes est
    // bien plus longue qu'un reçu.
    await attendre(Math.max(1200, Math.ceil(octets.length / 10)));
  } finally {
    await device.disconnect().catch(() => {});
    // L'imprimante a besoin d'un court répit avant d'accepter une nouvelle connexion (ticket suivant).
    await attendre(400);
  }
}

/**
 * Confie le ticket à l'application gratuite RawBT, qui pilote l'imprimante elle-même (Bluetooth classique ou basse consommation, USB) :
 * secours pour les imprimantes qui refusent la connexion directe. RawBT doit être installée.
 */
async function envoyerParRawBt(octets: Uint8Array): Promise<void> {
  const donnees = Buffer.from(octets).toString("base64");
  try {
    await Linking.openURL(`rawbt:base64,${donnees}`);
  } catch {
    throw new Error(
      "L'application RawBT n'est pas installée sur ce téléphone. Installez « RawBT » depuis le Play Store (gratuit), choisissez-y votre imprimante, puis réessayez."
    );
  }
}

async function envoyer(address: string | null, octets: Uint8Array): Promise<void> {
  const mode = await lireModeImpression();
  if (mode === "rawbt") {
    await enFile(() => envoyerParRawBt(octets));
    return;
  }
  if (!address) throw new Error("Aucune imprimante configurée — réglez-la depuis Plus > Imprimante.");
  await enFile(() => envoyerParBluetooth(address, octets));
}

/** Imprime un reçu déjà construit (`construireRecuFacture`/`construireRecuVente`)
 * sur l'imprimante mémorisée dans Paramètres. */
export async function imprimerLignes(lignes: LigneRecu[]): Promise<void> {
  const appareil = await lireAppareilImprimante();
  const mode = await lireModeImpression();
  if (!appareil && mode !== "rawbt") {
    throw new Error("Aucune imprimante configurée — réglez-la depuis Plus > Imprimante.");
  }
  await envoyer(appareil?.address ?? null, genererCommandesEscPos(lignes, COLONNES_PAR_LARGEUR[await lireLargeurPapier()]));
}

/** Ticket de test envoyé directement à une adresse (pas forcément celle déjà
 * mémorisée, pour pouvoir tester avant d'enregistrer). */
export async function imprimerTicketDeTest(address: string | null, hotel: EnteteHotel): Promise<void> {
  await envoyer(address, genererCommandesEscPos(construireTicketDeTest(hotel), COLONNES_PAR_LARGEUR[await lireLargeurPapier()]));
}

/** Ouvre la page Bluetooth des réglages du téléphone (activer le Bluetooth, appairer l'imprimante). Sans cette page (autre système), les réglages généraux. */
export async function ouvrirReglagesBluetooth(): Promise<void> {
  if (Platform.OS === "android") {
    try {
      await Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS");
      return;
    } catch {
      // Intention refusée par ce téléphone : on retombe sur les réglages généraux.
    }
  }
  await Linking.openSettings();
}
