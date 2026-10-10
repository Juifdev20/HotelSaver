import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { lirePreferencesSecurite } from "../stockage/preferencesSecurite";

/**
 * Verrou d'inactivité FACULTATIF : si l'utilisateur l'a activé dans les réglages, quitter l'application plus longtemps que
 * le délai choisi ramène à l'écran de profils (le mot de passe est alors redemandé). Désactivé par défaut : aucun effet.
 */
export function useVerrouInactivite(actif: boolean, verrouiller: () => void): void {
  const partiLe = useRef<number | null>(null);
  const verrouillerRef = useRef(verrouiller);
  verrouillerRef.current = verrouiller;
  useEffect(() => {
    if (!actif) return;
    const abonnement = AppState.addEventListener("change", (etat) => {
      if (etat === "active") {
        const depart = partiLe.current;
        partiLe.current = null;
        if (depart === null) return;
        void lirePreferencesSecurite().then(({ inactiviteMinutes }) => {
          if (inactiviteMinutes !== null && Date.now() - depart >= inactiviteMinutes * 60_000) verrouillerRef.current();
        });
      } else if (partiLe.current === null) {
        partiLe.current = Date.now();
      }
    });
    return () => abonnement.remove();
  }, [actif]);
}
