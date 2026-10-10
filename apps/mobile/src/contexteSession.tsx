import * as React from "react";
import { createContext, useContext } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { MoteurSync } from "@hotel-chicago/sync-engine";
import type { Miroir } from "@hotel-chicago/miroir-local";
import type { ProfilConnecte } from "@hotel-chicago/types";

/** Évite de faire passer `client`/`utilisateur` en props à travers chaque
 * écran de la navigation par onglets — react-navigation ne les transmet
 * pas nativement à ses écrans. */
export interface Session {
  client: ClientApi;
  utilisateur: ProfilConnecte;
  /** Retour à l'écran de sélection de profil (garde le profil enregistré,
   * jeton compris, pour un retour rapide) — PATRON uniquement côté UI. */
  changerDeProfil: () => void;
  /** Déconnexion complète : le profil ET son jeton sont oubliés — la
   * reconnexion exige le mot de passe (employés, retour terrain 28/09). */
  seDeconnecter: () => void;
  /** Démarré après connexion, arrêté dans changerDeProfil() — voir App.tsx. */
  moteurSync: MoteurSync;
  /** Base locale de l'hôtel : état « créé ici, pas encore enregistré », actions refusées à retirer… */
  miroir: Miroir;
  /** Relit GET /auth/me (ex. après un changement de réglage de l'hôtel) pour mettre les écrans à jour. */
  rechargerProfil: () => Promise<void>;
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
