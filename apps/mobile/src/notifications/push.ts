import { Alert, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { CategorieNotification } from "@hotel-chicago/types";

// Application au premier plan : la notification s'affiche quand même (bannière + son).
// Alerte de stock : au premier plan, c'est l'application elle-même qui l'annonce à la voix (avec le nom du produit) ; la sonnerie du canal
// ferait un doublon. Application fermée ou en arrière-plan, le canal sonne avec la voix.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const type = (notification.request.content.data as { type?: string } | undefined)?.type;
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: type !== "STOCK_BAS" && type !== "STOCK_EPUISE",
      shouldSetBadge: false,
    };
  },
});

/** Un canal par catégorie : l'utilisateur règle son et importance de chacun dans les réglages Android. */
const CANAUX: { id: CategorieNotification; nom: string; importance: Notifications.AndroidImportance }[] = [
  { id: "reservations", nom: "Réservations", importance: Notifications.AndroidImportance.HIGH },
  { id: "stock", nom: "Stock", importance: Notifications.AndroidImportance.HIGH },
  { id: "quotidien", nom: "Résumés du jour", importance: Notifications.AndroidImportance.DEFAULT },
  { id: "securite", nom: "Sécurité et abonnement", importance: Notifications.AndroidImportance.HIGH },
];

/**
 * Les alertes de stock sonnent avec la voix (fichiers res/raw copiés par le plugin expo-notifications, voir app.json) : un canal chacune, car le
 * son d'un canal Android ne peut plus changer une fois créé. Mêmes identifiants que le serveur (push.service.ts).
 */
const CANAUX_VOIX = [
  { id: "stock_bas", nom: "Stock bas", son: "stock_bas.mp3" },
  { id: "stock_epuise", nom: "Rupture de stock", son: "stock_epuise.mp3" },
];

export async function creerCanaux(): Promise<void> {
  if (Platform.OS !== "android") return;
  for (const canal of CANAUX_VOIX) {
    await Notifications.setNotificationChannelAsync(canal.id, {
      name: canal.nom,
      importance: Notifications.AndroidImportance.MAX,
      sound: canal.son,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: "#053483",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
  for (const canal of CANAUX) {
    await Notifications.setNotificationChannelAsync(canal.id, {
      name: canal.nom,
      importance: canal.importance,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: "#053483",
      // Écran verrouillé : seul un texte neutre s'affiche (les messages citent des noms de clients, des chambres, des motifs d'annulation).
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
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
 * Renvoie `arreter` (écoute du renouvellement du jeton) et `enregistre` : faux si le serveur n'a pas pu être
 * joint (démarrage instantané sans jeton d'accès encore, ou hors ligne) — l'appelant réessaie alors.
 */
export async function enregistrerAppareil(client: ClientApi): Promise<{ arreter: () => void; enregistre: boolean }> {
  const rien = { arreter: () => undefined, enregistre: true };
  try {
    if (Platform.OS !== "android" || !Device.isDevice) return rien;
    await creerCanaux();
    if (!(await permissionAccordee())) return rien;

    const envoyer = async (jeton: string) => {
      await client.enregistrerAppareilPush(jeton, "android");
      jetonEnregistre = jeton;
    };
    const jeton = (await Notifications.getDevicePushTokenAsync()).data;
    let enregistre = true;
    if (typeof jeton === "string" && jeton) {
      enregistre = await envoyer(jeton).then(
        () => true,
        () => false
      );
    }
    const abonnement = Notifications.addPushTokenListener((nouveau) => {
      if (typeof nouveau.data === "string") void envoyer(nouveau.data).catch(() => undefined);
    });
    return { arreter: () => abonnement.remove(), enregistre };
  } catch {
    return rien;
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
