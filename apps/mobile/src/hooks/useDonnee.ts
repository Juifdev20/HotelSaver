import * as React from "react";
import { useEffect, useState } from "react";

/** Chargement générique (donnée/erreur/en cours + rechargement manuel) —
 * extrait de EcranTableauDeBord.tsx pour être réutilisé par tous les écrans
 * qui chargent une ressource depuis l'API (Menu, Stock, Comptes ouverts...).
 * `chargerRef` évite les fermetures obsolètes quand `charger` change entre
 * deux rendus sans que `cle` change. */
export function useDonnee<T>(charger: (() => Promise<T>) | null, cle: unknown) {
  const [etat, setEtat] = useState<{ donnee: T | null; erreur: string | null; enCours: boolean }>({
    donnee: null,
    erreur: null,
    enCours: true,
  });
  const chargerRef = React.useRef(charger);
  chargerRef.current = charger;

  const recharger = React.useCallback(() => {
    const currentCharger = chargerRef.current;
    if (!currentCharger) return;
    setEtat((e) => ({ ...e, enCours: true }));
    currentCharger()
      .then((donnee) => setEtat({ donnee, erreur: null, enCours: false }))
      .catch((erreur: Error) => setEtat({ donnee: null, erreur: erreur.message, enCours: false }));
  }, []);

  useEffect(() => {
    recharger();
  }, [cle]);
  return { ...etat, recharger };
}
