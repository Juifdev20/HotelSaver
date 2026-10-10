import * as React from "react";
import { useContext, useEffect, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { NavigationContext, type NavigationProp, type ParamListBase } from "@react-navigation/native";

// Contexte facultatif : un écran monté hors navigation (connexion…) est simplement « visible » ; useNavigation() lèverait.
const ContexteNavigation = NavigationContext as unknown as React.Context<NavigationProp<ParamListBase> | undefined>;

/**
 * Bouton Retour d'Android pour les sous-écrans gérés par un état local (CoquilleOnglets est un Tab.Navigator plat, sans pile) :
 * sans ça, « Retour » quitte l'application ou saute à l'Accueil en jetant la saisie en cours.
 *
 * - `onRetour` fait ce que fait le bouton « ‹ Retour » à l'écran (y compris sa confirmation d'abandon éventuelle) ;
 *   renvoyer `false` laisse le comportement par défaut.
 * - Seul l'onglet visible répond : les autres onglets restent montés mais ne doivent pas capter le bouton.
 * - Le gestionnaire est enregistré une fois et lit toujours la dernière version de `onRetour` (pas de réordonnancement
 *   entre un écran parent et son enfant). Une fenêtre modale (FeuilleModale, Alert) garde la priorité : Android la ferme d'abord.
 */
export function useRetourAndroid(onRetour: (() => boolean | void) | undefined, actif = true): void {
  const navigation = useContext(ContexteNavigation);
  const [visible, setVisible] = useState(() => navigation?.isFocused() ?? true);

  useEffect(() => {
    if (!navigation) return;
    setVisible(navigation.isFocused());
    const retirerFocus = navigation.addListener("focus", () => setVisible(true));
    const retirerBlur = navigation.addListener("blur", () => setVisible(false));
    return () => {
      retirerFocus();
      retirerBlur();
    };
  }, [navigation]);

  const rappel = useRef(onRetour);
  rappel.current = onRetour;

  useEffect(() => {
    if (!actif || !visible) return;
    const abonnement = BackHandler.addEventListener("hardwareBackPress", () => {
      const fn = rappel.current;
      if (!fn) return false;
      return fn() !== false;
    });
    return () => abonnement.remove();
  }, [actif, visible]);
}
