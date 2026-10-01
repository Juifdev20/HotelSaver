import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { LienNotification, NotificationApp, Role } from "@hotel-chicago/types";
import { ongletsPourRole, type IdOnglet } from "../navigation";
import { enregistrerAppareil } from "./push";
import { navigationRef } from "./navigationRef";

const INTERVALLE_MS = 30_000;

/** Vue de l'onglet « Plus » à ouvrir (les écrans qui n'ont pas leur propre onglet). */
export interface DemandePlus {
  vue: "stock" | "arrivees-departs";
  cle: number;
}

interface ValeurNotifications {
  notifications: NotificationApp[];
  nonLues: number;
  centreOuvert: boolean;
  ouvrirCentre: () => void;
  fermerCentre: () => void;
  marquerLue: (id: string) => Promise<void>;
  toutMarquerLu: () => Promise<void>;
  /** Clic dans la liste : marque lue puis ouvre l'écran concerné. */
  ouvrirNotification: (notification: NotificationApp) => void;
  demandePlus: DemandePlus | null;
  consommerDemandePlus: () => void;
}

const Contexte = createContext<ValeurNotifications | null>(null);

/** Écran visé par une notification → onglet du bas (+ vue de « Plus » le cas échéant), selon le rôle. */
export function cibleDeLien(lien: LienNotification, role: Role): { onglet: IdOnglet; plus?: DemandePlus["vue"] } {
  const onglets = ongletsPourRole(role).map((o) => o.id);
  const si = (onglet: IdOnglet, plus?: DemandePlus["vue"]) => (onglets.includes(onglet) ? { onglet, plus } : null);
  const cible =
    lien.ecran === "reservations" || lien.ecran === "facturation" // la facturation vit dans « Réserv. »
      ? si("reservations")
      : lien.ecran === "chambres"
        ? si("chambres")
        : lien.ecran === "stock"
          ? si("plus", "stock")
          : lien.ecran === "arrivees-departs"
            ? si("plus", "arrivees-departs")
            : null;
  return cible ?? { onglet: "tableau-de-bord" };
}

export function FournisseurNotifications({
  client,
  role,
  children,
}: {
  client: ClientApi;
  role: Role;
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<NotificationApp[]>([]);
  const [nonLues, setNonLues] = useState(0);
  const [centreOuvert, setCentreOuvert] = useState(false);
  const [demandePlus, setDemandePlus] = useState<DemandePlus | null>(null);
  const compteurDemandes = useRef(0);
  const enAttente = useRef<LienNotification | null>(null);

  const charger = useCallback(async () => {
    try {
      const reponse = await client.listerNotifications({ limite: 60 });
      setNotifications(reponse.notifications);
      setNonLues(reponse.nonLues);
    } catch {
      // Hors ligne : la liste précédente reste affichée.
    }
  }, [client]);

  const naviguer = useCallback(
    (lien: LienNotification) => {
      const { onglet, plus } = cibleDeLien(lien, role);
      if (plus) setDemandePlus({ vue: plus, cle: ++compteurDemandes.current });
      if (navigationRef.isReady()) navigationRef.navigate(onglet as never);
      else enAttente.current = lien; // lancement à froid : appliqué dès que la navigation est prête
    },
    [role]
  );

  // Interrogation toutes les 30 s + au retour au premier plan.
  useEffect(() => {
    void charger();
    const minuteur = setInterval(() => void charger(), INTERVALLE_MS);
    const abonnement = AppState.addEventListener("change", (etat) => {
      if (etat === "active") void charger();
    });
    return () => {
      clearInterval(minuteur);
      abonnement.remove();
    };
  }, [charger]);

  // Enregistrement du téléphone au nom de CET utilisateur (retiré à la déconnexion, voir App.tsx).
  useEffect(() => {
    let arreter: (() => void) | undefined;
    let annule = false;
    void enregistrerAppareil(client).then((fn) => {
      if (annule) fn();
      else arreter = fn;
    });
    return () => {
      annule = true;
      arreter?.();
    };
  }, [client]);

  // Tap sur une notification du système (écran verrouillé, app fermée ou en arrière-plan).
  useEffect(() => {
    const traiter = (reponse: Notifications.NotificationResponse | null) => {
      const data = reponse?.notification.request.content.data as { ecran?: string; id?: string; notificationId?: string } | undefined;
      if (!data?.ecran) return;
      naviguer({ ecran: data.ecran as LienNotification["ecran"], id: data.id });
      if (data.notificationId) void client.marquerNotificationLue(data.notificationId).then(charger, () => undefined);
      Notifications.clearLastNotificationResponse();
    };
    traiter(Notifications.getLastNotificationResponse());
    const abonnement = Notifications.addNotificationResponseReceivedListener(traiter);
    return () => abonnement.remove();
  }, [client, naviguer, charger]);

  // Lancement à froid : l'ouverture de l'onglet attend que le conteneur de navigation soit prêt.
  useEffect(() => {
    const minuteur = setInterval(() => {
      if (enAttente.current && navigationRef.isReady()) {
        const lien = enAttente.current;
        enAttente.current = null;
        naviguer(lien);
      }
    }, 300);
    return () => clearInterval(minuteur);
  }, [naviguer]);

  const marquerLue = useCallback(
    async (id: string) => {
      setNotifications((l) => l.map((n) => (n.id === id ? { ...n, lue: true } : n)));
      try {
        await client.marquerNotificationLue(id);
      } finally {
        void charger();
      }
    },
    [client, charger]
  );

  const toutMarquerLu = useCallback(async () => {
    setNotifications((l) => l.map((n) => ({ ...n, lue: true })));
    setNonLues(0);
    try {
      await client.marquerToutesNotificationsLues();
    } finally {
      void charger();
    }
  }, [client, charger]);

  const valeur = useMemo<ValeurNotifications>(
    () => ({
      notifications,
      nonLues,
      centreOuvert,
      ouvrirCentre: () => setCentreOuvert(true),
      fermerCentre: () => setCentreOuvert(false),
      marquerLue,
      toutMarquerLu,
      ouvrirNotification: (notification) => {
        setCentreOuvert(false);
        if (!notification.lue) void marquerLue(notification.id).catch(() => undefined);
        naviguer(notification.lien);
      },
      demandePlus,
      consommerDemandePlus: () => setDemandePlus(null),
    }),
    [notifications, nonLues, centreOuvert, marquerLue, toutMarquerLu, naviguer, demandePlus]
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useNotifications(): ValeurNotifications {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error("useNotifications() appelé hors de <FournisseurNotifications>.");
  return valeur;
}
