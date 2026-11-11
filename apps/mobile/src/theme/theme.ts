import { StyleSheet } from "react-native";
import { styleClair, styleSombre } from "@hotel-chicago/regles";

/**
 * État du thème (11/11/2026). L'application écrit ses couleurs « en clair » (tokens.ts) ; en mode sombre, `installerThemeStyles` fait traduire chaque
 * style à la lecture (règles pures dans @hotel-chicago/regles/theme-sombre). Le thème change rarement (réglage Paramètres › Apparence) : à chaque
 * changement, `versionTheme` augmente et l'arbre de navigation est remonté (voir App.tsx), ce qui relit tous les styles.
 */
let sombre = false;
let version = 0;
let retourReglages = false;

export const estSombre = (): boolean => sombre;
export const versionTheme = (): number => version;

/** Applique le schéma ; renvoie vrai s'il a réellement changé. Idempotent : sans changement, la version ne bouge pas. */
export function appliquerSchema(schema: "clair" | "sombre"): boolean {
  const veutSombre = schema === "sombre";
  if (veutSombre === sombre) return false;
  sombre = veutSombre;
  version += 1;
  return true;
}

/** Après un changement de thème, l'arbre est remonté : on revient dans Plus › Paramètres (où l'on était) au lieu de l'Accueil. */
export function demanderRetourReglages(): void {
  retourReglages = true;
}
export function retourReglagesDemande(): boolean {
  return retourReglages;
}
export function consommerRetourReglages(): boolean {
  const v = retourReglages;
  retourReglages = false;
  return v;
}

let installe = false;

/**
 * Fait traduire les styles par `StyleSheet.create` : chaque style est lu à travers le thème courant. Clair : le style d'origine. Sombre : une
 * copie recolorée, mémorisée par version (même objet tant que le thème ne change pas). À appeler UNE fois, avant le premier `StyleSheet.create`.
 */
export function installerThemeStyles(): void {
  if (installe) return;
  installe = true;
  const creer = StyleSheet.create.bind(StyleSheet) as (definition: Record<string, unknown>) => Record<string, unknown>;
  (StyleSheet as unknown as { create: (definition: Record<string, unknown>) => Record<string, unknown> }).create = (definition) => {
    const base = creer(definition);
    const resultat: Record<string, unknown> = {};
    for (const nom of Object.keys(base)) {
      let versionMemo = -1;
      let memo: unknown;
      Object.defineProperty(resultat, nom, {
        enumerable: true,
        get() {
          const style = base[nom];
          if (style === null || typeof style !== "object") return style;
          if (versionMemo !== version) {
            // Clair : le style d'origine (remis en clair si le module a été chargé en mode sombre) ; sombre : sa copie recolorée.
            memo = sombre ? styleSombre(style as Record<string, unknown>) : styleClair(style as Record<string, unknown>);
            versionMemo = version;
          }
          return memo;
        },
      });
    }
    return resultat;
  };
}

/**
 * Pour une table de couleurs écrite au niveau du module (ex. une couleur par statut) : la table est recalculée à chaque changement de thème.
 * `fabrique` lit `couleurs.*` (tokens.ts), qui suit le thème.
 */
export function parTheme<T extends object>(fabrique: () => T): T {
  let versionMemo = -1;
  let valeur = {} as T;
  const courant = (): T => {
    if (versionMemo !== version) {
      valeur = fabrique();
      versionMemo = version;
    }
    return valeur;
  };
  return new Proxy({} as T, {
    get: (_cible, cle) => Reflect.get(courant(), cle),
    has: (_cible, cle) => Reflect.has(courant(), cle),
    ownKeys: () => Reflect.ownKeys(courant()),
    getOwnPropertyDescriptor: (_cible, cle) => {
      const d = Reflect.getOwnPropertyDescriptor(courant(), cle);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}
