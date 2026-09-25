import * as React from "react";
import { createContext, useContext } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { UtilisateurAuthentifie } from "@hotel-chicago/types";

/** Évite de faire passer `client`/`utilisateur` en props à travers chaque
 * écran de la navigation par onglets — react-navigation ne les transmet
 * pas nativement à ses écrans. */
export interface Session {
  client: ClientApi;
  utilisateur: UtilisateurAuthentifie;
  /** Retour à l'écran de sélection de profil (garde le profil enregistré, juste la session en cours). */
  changerDeProfil: () => void;
}

const ContexteSession = createContext<Session | null>(null);

export function FournisseurSession({ session, children }: { session: Session; children: React.ReactNode }) {
  return <ContexteSession.Provider value={session}>{children}</ContexteSession.Provider>;
}

export function useSession(): Session {
  const session = useContext(ContexteSession);
  if (!session) throw new Error("useSession() appelé hors de <FournisseurSession>.");
  return session;
}
