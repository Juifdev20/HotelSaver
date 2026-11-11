import { useCallback, useEffect, useState } from "react";
import { StatutCompte } from "@hotel-chicago/types";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "./useSyncEtat";

/**
 * Nombre de tables/comptes ouverts, lu dans la base locale (marche hors ligne), pour la pastille de l'onglet « En cours ». Relu à chaque
 * synchronisation et toutes les 20 secondes : une table ouverte ou encaissée depuis cet écran se voit sans attendre le réseau.
 */
export function useNombreComptesOuverts(actif: boolean): number {
  const { client } = useSession();
  const etat = useSyncEtat();
  const [nombre, setNombre] = useState(0);
  const relire = useCallback(() => {
    client
      .listerComptesCafeteria(StatutCompte.OUVERT)
      .then((l) => setNombre(l.length))
      .catch(() => undefined);
  }, [client]);
  useEffect(() => {
    if (!actif) return;
    relire();
    const minuteur = setInterval(relire, 20_000);
    return () => clearInterval(minuteur);
  }, [actif, relire, etat.dernierePousseeLe]);
  return nombre;
}
