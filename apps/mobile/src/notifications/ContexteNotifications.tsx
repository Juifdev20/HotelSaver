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
  vue: "stock" | "arrivees-departs" | "rapports" | "comptes-ouverts" | "compte" | "synchronisation";
  /** Compte cafétéria à ouvrir directement (deep-link notification). */
  compteId?: string;
  cle: number;
}

/** Demande d'ouverture d'un compte précis dans l'onglet « Comptes »
 * (rôle CAFETARIA, qui possède cet onglet — le patron passe par « Plus »). */
export interface DemandeCompte {
  compteId: string;
  cle: number;
}

/** Demande d'ouverture d'une réservation précise dans l'onglet « Réserv. »
 * (RECEPTIONNISTE/PATRON) — arrivées, annulations, départs dépassés. */
export interface DemandeReservation {
  reservationId: string;
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
  demandeCompte: DemandeCompte | null;
  consommerDemandeCompte: () => void;
  demandeReservation: DemandeReservation | null;
  consommerDemandeReservation: () => void;
  /** Ouvre l'écran « Synchronisation » (onglet Plus) — bandeau d'état hors ligne / action refusée de EnteteMobile. */
  ouvrirSynchronisation: () => void;
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
        : lien.ecran === "comptes-ouverts"
          ? si("comptes-ouverts") ?? si("plus", "comptes-ouverts")
          : lien.ecran === "stock"
            ? si("plus", "stock")
            : lien.ecran === "arrivees-departs"
              ? si("plus", "arrivees-departs")
              : lien.ecran === "rapports"
                ? si("plus", "rapports")
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
  const [demandeCompte, setDemandeCompte] = useState<DemandeCompte | null>(null);
  const [demandeReservation, setDemandeReservation] = useState<DemandeReservation | null>(null);
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
      // Un lien « comptes-ouverts » porte l'id du compte : on ouvre le détail
      // directement — via l'onglet Comptes (CAFETARIA) ou la vue « compte »
      // de Plus (PATRON, qui n'a pas cet onglet).
      const compteId = lien.ecran === "comptes-ouverts" ? lien.id : undefined;
      // Un lien « reservations » porte l'id du séjour : le détail s'ouvre
      // directement dans l'onglet Réserv. (RECEPTIONNISTE et PATRON l'ont
      // tous deux en bas — pas de fallback Plus nécessaire).
      const reservationId = lien.ecran === "reservations" ? lien.id : undefined;
      if (plus) {
        setDemandePlus({
          vue: plus === "comptes-ouverts" && compteId ? "compte" : plus,
          compteId,
          cle: ++compteurDemandes.current,
        });
      } else if (compteId) {
        setDemandeCompte({ compteId, cle: ++compteurDemandes.current });
      } else if (reservationId) {
        setDemandeReservation({ reservationId, cle: ++compteurDemandes.current });
      }
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
  // Réessaye (toutes les 15 s, 20 fois) tant que le serveur n'a pas pu être joint : au démarrage instantané le
  // jeton d'accès arrive quelques instants après l'ouverture de l'application.
  useEffect(() => {
    let arreter: (() => void) | undefined;
    let annule = false;
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    const essayer = async (tentative: number) => {
      const resultat = await enregistrerAppareil(client);
      if (annule) {
        resultat.arreter();
        return;
      }
      arreter?.();
      arreter = resultat.arreter;
      if (!resultat.enregistre && tentative < 20) minuteur = setTimeout(() => void essayer(tentative + 1), 15_000);
    };
    void essayer(0);
    return () => {
      annule = true;
      if (minuteur) clearTimeout(minuteur);
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

  const ouvrirSynchronisation = useCallback(() => {
    setDemandePlus({ vue: "synchronisation", cle: ++compteurDemandes.current });
    if (navigationRef.isReady()) navigationRef.navigate("plus" as never);
  }, []);

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
      demandeCompte,
      consommerDemandeCompte: () => setDemandeCompte(null),
      demandeReservation,
      consommerDemandeReservation: () => setDemandeReservation(null),
      ouvrirSynchronisation,
    }),
    [notifications, nonLues, centreOuvert, marquerLue, toutMarquerLu, naviguer, ouvrirSynchronisation, demandePlus, demandeCompte, demandeReservation]
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useNotifications(): ValeurNotifications {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error("useNotifications() appelé hors de <FournisseurNotifications>.");
  return valeur;
}
