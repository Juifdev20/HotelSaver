import { useCallback, useEffect, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { estFonctionNonIncluse, signalerFonctionNonIncluse } from "../fonctions";

/**
 * Nombre d'acomptes payés en ligne qui attendent la décision du patron (pastille de « Remboursements »). Relu à l'ouverture de l'écran qui
 * l'affiche, chaque fois qu'il revient au premier plan, et quand `cle` change (ex. retour à la liste). Une erreur (hors ligne…) garde le dernier
 * nombre connu : une pastille n'est jamais un message d'erreur. `actif` faux (autre rôle, fonction fermée) = jamais d'appel au serveur.
 */
export function useRemboursementsAFaire(client: ClientApi, actif: boolean, cle?: unknown) {
  const [nombre, setNombre] = useState(0);
  const monte = useRef(true);
  const numero = useRef(0);
  const auPremierPlan = useIsFocused();

  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  const rafraichir = useCallback(() => {
    if (!actif) return;
    const mien = ++numero.current;
    client
      .nombreRemboursementsAFaire()
      .then((n) => {
        if (monte.current && mien === numero.current) setNombre(Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
      })
      .catch((e: unknown) => {
        if (estFonctionNonIncluse(e)) signalerFonctionNonIncluse();
      });
  }, [client, actif]);

  useEffect(() => {
    if (!actif) {
      numero.current++; // une réponse encore en route ne doit pas faire réapparaître la pastille
      setNombre(0);
      return;
    }
    if (auPremierPlan) rafraichir();
  }, [actif, auPremierPlan, rafraichir, cle]);

  return { nombre, rafraichir, definir: setNombre };
}
