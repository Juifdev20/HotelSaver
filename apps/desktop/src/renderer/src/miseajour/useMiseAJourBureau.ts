import { useCallback, useEffect, useState } from "react";
import type { EtatMiseAJourBureau } from "../../../main/mise-a-jour";

const INCONNU: EtatMiseAJourBureau = { etat: "inconnu", versionInstallee: "", version: null, notes: "", progres: 0, erreur: null, verifieeLe: null };

/** État des mises à jour tenu par le processus principal (electron-updater) : lu au montage, puis poussé à chaque évolution. */
export function useMiseAJourBureau() {
  const [etat, setEtat] = useState<EtatMiseAJourBureau>(INCONNU);
  useEffect(() => {
    let actif = true;
    void window.hotelChicago.miseAJour.etat().then((e) => actif && setEtat(e));
    const arreter = window.hotelChicago.miseAJour.surChangement((e) => actif && setEtat(e));
    return () => {
      actif = false;
      arreter();
    };
  }, []);
  const verifier = useCallback(() => window.hotelChicago.miseAJour.verifier().then(setEtat), []);
  const telecharger = useCallback(() => window.hotelChicago.miseAJour.telecharger().then(setEtat), []);
  const installer = useCallback(() => window.hotelChicago.miseAJour.installer(), []);
  return { etat, verifier, telecharger, installer };
}
