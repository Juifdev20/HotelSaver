// react-native tel que le code de l'application (apps/mobile) le voit : react-native-web, mais « en Android » (l'application ne
// sort que sur Android) pour que ses branches `Platform.OS === "android"` soient prises comme sur le téléphone, avec une vraie
// boîte de dialogue (Alert) et les permissions Android accordées d'office.
import { Platform as PlatformWeb, StatusBar as StatusBarWeb } from "react-native-web";
import { alerte } from "./alerte.js";
export * from "react-native-web";

export const Platform = {
  OS: "android",
  Version: 35,
  isTV: false,
  isTesting: false,
  select: (choix) => ("android" in choix ? choix.android : "native" in choix ? choix.native : choix.default),
  constants: PlatformWeb.constants ?? {},
};

/** Hauteur de la barre d'état simulée (même valeur que les marges de sécurité, voir safe-area-context.js). */
export const StatusBar = Object.assign(StatusBarWeb ?? (() => null), { currentHeight: globalThis.__HS_INSETS__?.top ?? 28 });

export const Alert = { alert: alerte };

export const PermissionsAndroid = {
  PERMISSIONS: { BLUETOOTH_CONNECT: "android.permission.BLUETOOTH_CONNECT", BLUETOOTH_SCAN: "android.permission.BLUETOOTH_SCAN", CAMERA: "android.permission.CAMERA" },
  RESULTS: { GRANTED: "granted", DENIED: "denied", NEVER_ASK_AGAIN: "never_ask_again" },
  request: async () => "granted",
  requestMultiple: async (liste) => Object.fromEntries(liste.map((p) => [p, "granted"])),
  check: async () => true,
};

/** Pas de bouton Retour matériel dans un navigateur (react-native-web consigne une erreur à chaque abonnement). */
export const BackHandler = { addEventListener: () => ({ remove() {} }), removeEventListener() {}, exitApp() {} };
