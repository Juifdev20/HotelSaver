import { Injectable, Logger } from "@nestjs/common";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { CATEGORIE_PAR_TYPE, type TypeNotification } from "@hotel-chicago/types";

export interface NotificationAEnvoyer {
  id: string;
  type: TypeNotification;
  titre: string;
  corps: string;
  lien: { ecran: string; id?: string };
}

/** Canal Android d'une notification. Les alertes de stock ont un canal chacune : le son d'un canal ne peut plus changer une fois créé. */
function canalDe(type: TypeNotification): string {
  if (type === "STOCK_BAS") return "stock_bas";
  if (type === "STOCK_EPUISE") return "stock_epuise";
  return CATEGORIE_PAR_TYPE[type];
}

/** Nom du fichier son (sans extension, dans res/raw) d'une alerte qui sonne avec la voix. */
function sonDe(type: TypeNotification): string | undefined {
  if (type === "STOCK_BAS") return "stock_bas";
  if (type === "STOCK_EPUISE") return "stock_epuise";
  return undefined;
}

const TAILLE_PAQUET = 500;

/** Codes FCM d'un jeton mort (app désinstallée, jeton périmé) : à supprimer de la base. */
const CODES_JETON_INVALIDE = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);

/**
 * Envoi des notifications push via Firebase Cloud Messaging. Actif seulement si
 * `FIREBASE_SERVICE_ACCOUNT_JSON` est défini (clé de compte de service : JSON brut ou base64,
 * SECRET — jamais commité). Sinon : journal « push désactivé » et rien d'autre ne change
 * (le centre de notifications et le desktop fonctionnent sans Firebase).
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private messaging: Messaging | null | undefined;

  private obtenirMessaging(): Messaging | null {
    if (this.messaging !== undefined) return this.messaging;
    const brut = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (!brut) {
      this.logger.warn("Push désactivé : FIREBASE_SERVICE_ACCOUNT_JSON n'est pas défini (voir FIREBASE.md).");
      return (this.messaging = null);
    }
    try {
      const json = brut.startsWith("{") ? brut : Buffer.from(brut, "base64").toString("utf8");
      const application = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(json)) });
      return (this.messaging = getMessaging(application));
    } catch (erreur) {
      this.logger.error(`Push désactivé : clé Firebase illisible (${(erreur as Error).message}).`);
      return (this.messaging = null);
    }
  }

  estActif(): boolean {
    return this.obtenirMessaging() !== null;
  }

  /**
   * Envoie à tous les jetons donnés et renvoie ceux que Firebase déclare morts. Ne lève jamais.
   * `aBlanc` : validation sans livraison (test de la configuration).
   */
  async envoyer(jetons: string[], notification: NotificationAEnvoyer, aBlanc = false): Promise<{ envoyes: number; invalides: string[] }> {
    const messaging = this.obtenirMessaging();
    if (!messaging || jetons.length === 0) return { envoyes: 0, invalides: [] };

    const data: Record<string, string> = {
      notificationId: notification.id,
      type: notification.type,
      ecran: notification.lien.ecran,
    };
    if (notification.lien.id) data.id = notification.lien.id;

    try {
      // Firebase accepte au plus 500 destinataires par appel : au-delà (annonce à tous les hôtels), on envoie par paquets.
      if (jetons.length > TAILLE_PAQUET) {
        let envoyes = 0;
        const invalides: string[] = [];
        for (let i = 0; i < jetons.length; i += TAILLE_PAQUET) {
          const partie = await this.envoyer(jetons.slice(i, i + TAILLE_PAQUET), notification, aBlanc);
          envoyes += partie.envoyes;
          invalides.push(...partie.invalides);
        }
        return { envoyes, invalides };
      }
      const reponse = await messaging.sendEachForMulticast(
        {
          tokens: jetons,
          notification: { title: notification.titre, body: notification.corps },
          data,
          android: {
            priority: "high",
            // Le canal (créé par l app) détermine le son et l importance. Une étiquette UNIQUE par notification : avec une étiquette par type, la 2e demande de réservation remplaçait la 1re sur le téléphone.
            // Alertes de stock : canaux « voix » (sonnerie = la voix de Delphine, fichier res/raw créé par l'app) ; les autres, leur canal de catégorie.
            // Petite icône (silhouette du logo, res/drawable/notification_icon) et couleur d'accent nommées explicitement : sans elles, une notification reçue application fermée peut afficher une icône vide.
            notification: { channelId: canalDe(notification.type), tag: notification.id, icon: "notification_icon", color: "#053483", ...(sonDe(notification.type) ? { sound: sonDe(notification.type) } : {}) },
          },
        },
        aBlanc
      );
      const invalides = reponse.responses
        .map((r, i) => (!r.success && r.error && CODES_JETON_INVALIDE.has(r.error.code) ? jetons[i] : null))
        .filter((jeton): jeton is string => jeton !== null);
      return { envoyes: reponse.successCount, invalides };
    } catch (erreur) {
      this.logger.error(`Envoi FCM échoué : ${(erreur as Error).message}`);
      return { envoyes: 0, invalides: [] };
    }
  }
}
