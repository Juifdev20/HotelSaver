import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance } from "react-native";
import { schemaEffectif, type PreferenceApparence, type SchemaCouleurs } from "@hotel-chicago/regles";
import { lireApparence, ecrireApparence } from "../stockage/apparence";
import { appliquerSchema, demanderRetourReglages, versionTheme } from "./theme";

interface ContexteApparence {
  /** Ce que la personne a choisi (Auto par défaut). */
  preference: PreferenceApparence;
  /** Ce qui est réellement affiché. */
  schema: SchemaCouleurs;
  /** Augmente à chaque changement réel de thème : sert de `key` pour remonter l'arbre de navigation. */
  version: number;
  definir: (preference: PreferenceApparence) => void;
}

const Ctx = createContext<ContexteApparence | null>(null);

/**
 * Charge le choix d'apparence au démarrage (le voile de démarrage natif couvre ces quelques millisecondes), suit le réglage du téléphone en mode Auto
 * et applique le thème AVANT de peindre les enfants : le premier écran affiché a déjà les bonnes couleurs.
 */
export function FournisseurApparence({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<PreferenceApparence | null>(null);
  const [systeme, setSysteme] = useState<string | null>(() => Appearance.getColorScheme() ?? null);

  useEffect(() => {
    let actif = true;
    void lireApparence().then((p) => {
      if (actif) setPreference(p);
    });
    return () => {
      actif = false;
    };
  }, []);

  useEffect(() => {
    const abonnement = Appearance.addChangeListener(({ colorScheme }) => setSysteme(colorScheme ?? null));
    return () => abonnement.remove();
  }, []);

  const definir = useCallback((p: PreferenceApparence) => {
    void ecrireApparence(p);
    // Le changement remonte l'arbre : on revient dans Plus › Paramètres au lieu de l'Accueil.
    demanderRetourReglages();
    setPreference(p);
  }, []);

  const schema = schemaEffectif(preference, systeme);
  appliquerSchema(schema); // pendant le rendu, idempotent : la version n'augmente que si le schéma change
  const version = versionTheme();

  const valeur = useMemo<ContexteApparence>(() => ({ preference: preference ?? "auto", schema, version, definir }), [preference, schema, version, definir]);

  if (preference === null) return null;
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useApparence(): ContexteApparence {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApparence doit être utilisé sous <FournisseurApparence>.");
  return v;
}
