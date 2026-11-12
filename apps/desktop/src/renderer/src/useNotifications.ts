import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { MINUTES_AVANT_DISPARITION_NOTIFICATION, type LienNotification, type NotificationApp } from "@hotel-chicago/types";
import { annoncerStock } from "./sons";

/** Lien d'une notification côté bureau : comme celui du serveur, plus l'écran « Remboursements » (le serveur ne le connaît pas encore). */
export type LienApp = Omit<LienNotification, "ecran"> & { ecran: LienNotification["ecran"] | "remboursements" };

/** Où mène une notification. « Acompte à rembourser ? » ouvre l'écran Remboursements ; les autres suivent le lien envoyé par le serveur. */
export function lienDeNotification(n: Pick<NotificationApp, "type" | "lien">): LienApp {
  return n.type === "REMBOURSEMENT_A_FAIRE" ? { ecran: "remboursements", id: n.lien.id } : n.lien;
}

const INTERVALLE_MS = 15_000;
/** Au-delà, une rafale (ex. retour après une longue absence) devient un seul résumé. */
const MAX_TOASTS_PAR_RELEVE = 3;

/**
 * Alerte de stock (la première, ou le rappel que le serveur renvoie toutes les 24 h) arrivée pendant que le poste est ouvert : la voix l'annonce,
 * avec le nom du produit — sauf si CET utilisateur l'a coupée (ce produit, ou toutes). Une seule annonce par produit par relevé.
 */
async function annoncerAlertesStock(client: ClientApi, nouvelles: NotificationApp[]): Promise<void> {
  const alertes = nouvelles.filter((n) => n.type === "STOCK_BAS" || n.type === "STOCK_EPUISE");
  if (alertes.length === 0) return;
  let coupures: { toutes: boolean; produitIds: string[] } = { toutes: false, produitIds: [] };
  try {
    coupures = await client.listerCoupuresAlertesStock();
  } catch {
    // Hors ligne : on annonce, mieux vaut une alerte de trop qu'une rupture manquée.
  }
  if (coupures.toutes) return;
  const annonces = new Set<string>();
  for (const n of alertes) {
    const cle = n.lien.id ?? n.id;
    if (annonces.has(cle) || (n.lien.id && coupures.produitIds.includes(n.lien.id))) continue;
    annonces.add(cle);
    annoncerStock(n.lien.nom, n.type === "STOCK_EPUISE");
  }
}

/**
 * Centre de notifications : interroge l'API toutes les 15 s (même mécanique que la synchro, sans
 * flux persistant). Chaque nouvelle notification de MON hôtel et MON rôle (filtrage côté serveur)
 * déclenche une notification Windows, visible même fenêtre masquée dans la zone de notification.
 */
export function useNotifications(client: ClientApi | null, onOuvrirLien: (lien: LienApp) => void, identite?: string) {
  const [notificationsBrutes, setNotifications] = useState<NotificationApp[]>([]);
  const [nonLues, setNonLues] = useState(0);
  // Une notification lue disparaît 30 min après sa lecture (le serveur ne la renvoie plus non plus) : on recompte chaque minute.
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => clearInterval(minuteur);
  }, []);
  const notifications = useMemo(
    () => notificationsBrutes.filter((n) => !n.luLe || Date.parse(n.luLe) + MINUTES_AVANT_DISPARITION_NOTIFICATION * 60_000 > maintenant),
    [notificationsBrutes, maintenant]
  );
  const liste = useRef<NotificationApp[]>([]);
  liste.current = notificationsBrutes;
  const curseur = useRef<string | null>(null);
  const surLien = useRef(onOuvrirLien);
  surLien.current = onOuvrirLien;

  // Clic sur la notification Windows → l'écran concerné.
  useEffect(() => window.hotelChicago.surNotificationOuverte((lien) => surLien.current(lien as LienApp)), []);

  useEffect(() => {
    if (!client) return;
    let arrete = false;
    curseur.current = null;
    setNotifications([]);
    setNonLues(0);

    async function releve() {
      if (!client) return;
      try {
        const premiere = curseur.current === null;
        const reponse = await client.listerNotifications(premiere ? { limite: 50 } : { depuis: curseur.current ?? undefined, limite: 50 });
        if (arrete) return;
        setNonLues(reponse.nonLues);
        if (reponse.notifications.length > 0) {
          curseur.current = reponse.notifications[0].createdAt;
        } else if (premiere) {
          curseur.current = new Date().toISOString();
        }

        if (premiere) {
          setNotifications(reponse.notifications);
          // Démarrage : au plus un résumé, jamais une rafale de toasts pour l'historique.
          if (reponse.nonLues > 0) {
            void window.hotelChicago.notifier(
              "HotelSaver",
              reponse.nonLues === 1 ? "1 notification non lue" : `${reponse.nonLues} notifications non lues`,
              { ecran: "tableau-de-bord" }
            );
          }
          return;
        }
        if (reponse.notifications.length === 0) return;

        setNotifications((actuelles) => {
          const connues = new Set(actuelles.map((n) => n.id));
          return [...reponse.notifications.filter((n) => !connues.has(n.id)), ...actuelles].slice(0, 100);
        });
        void annoncerAlertesStock(client, reponse.notifications.filter((n) => !n.lue));
        const nouvelles = reponse.notifications.filter((n) => !n.lue);
        if (nouvelles.length > MAX_TOASTS_PAR_RELEVE) {
          void window.hotelChicago.notifier("HotelSaver", `${nouvelles.length} nouvelles notifications`, { ecran: "tableau-de-bord" });
        } else {
          for (const n of [...nouvelles].reverse()) void window.hotelChicago.notifier(n.titre, n.corps, lienDeNotification(n) as LienNotification);
        }
      } catch {
        // Hors ligne ou jeton en cours de renouvellement : on réessaie au prochain passage.
      }
    }

    void releve();
    const minuteur = setInterval(() => void releve(), INTERVALLE_MS);
    return () => {
      arrete = true;
      clearInterval(minuteur);
    };
  // `identite` : changer de compte (patron) repart d'une liste vide, celle du nouveau compte.
  }, [client, identite]);

  const marquerLue = useCallback(
    async (id: string) => {
      if (!client) return;
      if (liste.current.some((n) => n.id === id && !n.lue)) setNonLues((c) => Math.max(0, c - 1));
      setNotifications((l) => l.map((n) => (n.id === id ? { ...n, lue: true, luLe: n.luLe ?? new Date().toISOString() } : n)));
      try {
        await client.marquerNotificationLue(id);
      } catch {
        // Le prochain relevé réaffichera l'état réel.
      }
    },
    [client]
  );

  const toutMarquerLu = useCallback(async () => {
    if (!client) return;
    const instant = new Date().toISOString();
    setNotifications((l) => l.map((n) => ({ ...n, lue: true, luLe: n.luLe ?? instant })));
    setNonLues(0);
    try {
      await client.marquerToutesNotificationsLues();
    } catch {
      // idem
    }
  }, [client]);

  /** ✕ : efface UNE notification de MA liste (les autres personnes gardent la leur). */
  const effacer = useCallback(
    async (id: string) => {
      if (!client) return;
      if (liste.current.some((n) => n.id === id && !n.lue)) setNonLues((c) => Math.max(0, c - 1));
      setNotifications((l) => l.filter((n) => n.id !== id));
      try {
        await client.effacerNotification(id);
      } catch {
        // Hors ligne : elle reviendra au prochain relevé, l'utilisateur peut recommencer.
      }
    },
    [client]
  );

  /** « Tout effacer » (après confirmation côté écran). */
  const toutEffacer = useCallback(async () => {
    if (!client) return;
    setNotifications([]);
    setNonLues(0);
    try {
      await client.effacerToutesNotifications();
    } catch {
      // idem
    }
  }, [client]);

  /** « Ne plus m'alerter pour ce produit » : coupe, pour moi seul, la voix et la notification de ce produit. */
  const couperAlerteStock = useCallback(
    async (produitId: string) => {
      if (!client) return;
      await client.couperAlerteStock(produitId);
    },
    [client]
  );

  return { notifications, nonLues, marquerLue, toutMarquerLu, effacer, toutEffacer, couperAlerteStock };
}
