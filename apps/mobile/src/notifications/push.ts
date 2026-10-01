import { Alert, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { CategorieNotification } from "@hotel-chicago/types";

// Application au premier plan : la notification s'affiche quand même (bannière + son).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Un canal par catégorie : l'utilisateur règle son et importance de chacun dans les réglages Android. */
const CANAUX: { id: CategorieNotification; nom: string; importance: Notifications.AndroidImportance }[] = [
  { id: "reservations", nom: "Réservations", importance: Notifications.AndroidImportance.HIGH },
  { id: "stock", nom: "Stock", importance: Notifications.AndroidImportance.HIGH },
  { id: "quotidien", nom: "Résumés du jour", importance: Notifications.AndroidImportance.DEFAULT },
  { id: "securite", nom: "Sécurité et abonnement", importance: Notifications.AndroidImportance.HIGH },
];

export async function creerCanaux(): Promise<void> {
  if (Platform.OS !== "android") return;
  for (const canal of CANAUX) {
    await Notifications.setNotificationChannelAsync(canal.id, {
      name: canal.nom,
      importance: canal.importance,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: "#053483",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

let explicationDejaMontree = false;

/** Android 13+ : permission demandée avec une phrase d'explication, jamais « à froid ». */
async function permissionAccordee(): Promise<boolean> {
  const actuelle = await Notifications.getPermissionsAsync();
  if (actuelle.granted) return true;
  if (!actuelle.canAskAgain || explicationDejaMontree) return false;
  explicationDejaMontree = true;
  const accepte = await new Promise<boolean>((resolve) => {
    Alert.alert(
      "Activer les notifications",
      "HotelSaver vous prévient même écran éteint : nouvelle demande de réservation, stock presque épuisé, chambre à préparer…",
      [
        { text: "Plus tard", style: "cancel", onPress: () => resolve(false) },
        { text: "Activer", onPress: () => resolve(true) },
      ],
      { cancelable: false }
    );
  });
  if (!accepte) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Jeton FCM actuellement enregistré pour l'utilisateur connecté (pour le retirer à la déconnexion). */
let jetonEnregistre: string | null = null;

/**
 * Enregistre ce téléphone au nom de l'utilisateur CONNECTÉ. Ne lève jamais : sans Firebase configuré
 * (pas de google-services.json) ou sans permission, l'application marche, simplement sans push.
 * Renvoie une fonction d'arrêt (écoute du renouvellement du jeton).
 */
export async function enregistrerAppareil(client: ClientApi): Promise<() => void> {
  try {
    if (Platform.OS !== "android" || !Device.isDevice) return () => undefined;
    await creerCanaux();
    if (!(await permissionAccordee())) return () => undefined;

    const envoyer = async (jeton: string) => {
      await client.enregistrerAppareilPush(jeton, "android");
      jetonEnregistre = jeton;
    };
    const jeton = (await Notifications.getDevicePushTokenAsync()).data;
    if (typeof jeton === "string" && jeton) await envoyer(jeton);
    const abonnement = Notifications.addPushTokenListener((nouveau) => {
      if (typeof nouveau.data === "string") void envoyer(nouveau.data).catch(() => undefined);
    });
    return () => abonnement.remove();
  } catch {
    return () => undefined;
  }
}

/**
 * À appeler AVANT de fermer la session (déconnexion, changement de profil) : sinon l'alerte du patron
 * s'afficherait sur le téléphone de l'employé suivant.
 */
export async function retirerAppareil(client: ClientApi | null): Promise<void> {
  const jeton = jetonEnregistre;
  jetonEnregistre = null;
  if (!client || !jeton) return;
  try {
    await client.retirerAppareilPush(jeton);
  } catch {
    // Hors ligne : le jeton sera réassigné au prochain utilisateur connecté (upsert côté serveur).
  }
}
