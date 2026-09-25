import { useEffect, useState } from "react";
import type { EtatSync } from "@hotel-chicago/sync-engine";
import { useSession } from "../contexteSession";

/** S'abonne à l'état du moteur de synchronisation (en ligne, file d'attente,
 * conflits) — utilisé par l'indicateur dans EnteteMobile et par
 * EcranSynchronisation. */
export function useSyncEtat(): EtatSync {
  const { moteurSync } = useSession();
  const [etat, setEtat] = useState<EtatSync>(moteurSync.etatActuel());

  useEffect(() => moteurSync.onChangement(setEtat), [moteurSync]);

  return etat;
}
