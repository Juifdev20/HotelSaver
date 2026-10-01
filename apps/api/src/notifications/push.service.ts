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
      const reponse = await messaging.sendEachForMulticast(
        {
          tokens: jetons,
          notification: { title: notification.titre, body: notification.corps },
          data,
          android: {
            priority: "high",
            // Le canal (créé par l'app) détermine le son et l'importance ; regroupe par catégorie.
            notification: { channelId: CATEGORIE_PAR_TYPE[notification.type], tag: notification.type },
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
