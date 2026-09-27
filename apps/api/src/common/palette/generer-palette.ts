import { PALETTE_DEFAUT } from "../palette-defaut";
import { assombrirPourContraste, hexVersHsl, hslVersHex } from "./couleur.util";

export interface CouleurBaseLogo {
  bleu: string;
  navy: string;
}

/**
 * Fonction pure : dérive UNIQUEMENT les tokens d'identité de marque
 * (bleu/bleuHover/bleuClair/bleuTresClair + navy/navyForte) d'une couleur
 * extraite d'un logo (voir extraire-couleurs-logo.ts). Tout le reste
 * (surfaces, bordures, encre, succes/danger/alerte/info) reste figé sur
 * PALETTE_DEFAUT — un logo saturé ne doit jamais recolorer un état
 * sémantique ni rendre le texte illisible (contraste WCAG AA, >= 4.5,
 * imposé sur `bleu` avant tout usage comme couleur de texte/action).
 *
 * `couleurBase = null` (aucun logo fourni, ou extraction échouée) → renvoie
 * PALETTE_DEFAUT tel quel, comportement de la Phase 4 inchangé.
 */
export function genererPalette(couleurBase: CouleurBaseLogo | null): typeof PALETTE_DEFAUT {
  if (!couleurBase) return PALETTE_DEFAUT;

  const bleu = assombrirPourContraste(couleurBase.bleu, "#FFFFFF", 4.5);
  const bleuHsl = hexVersHsl(bleu);
  const bleuHover = hslVersHex({ ...bleuHsl, l: Math.max(15, bleuHsl.l - 8) });
  const bleuClair = hslVersHex({ ...bleuHsl, s: bleuHsl.s * 0.5, l: 96 });
  const bleuTresClair = hslVersHex({ ...bleuHsl, s: bleuHsl.s * 0.3, l: 98 });

  const navy = assombrirPourContraste(couleurBase.navy, "#FFFFFF", 4.5);
  const navyHsl = hexVersHsl(navy);
  const navyForte = hslVersHex({ ...navyHsl, l: Math.max(10, navyHsl.l - 8) });

  // Thème sombre : même teinte, mais une version CLAIRE de l'accent (une
  // couleur d'action doit être plus claire que son fond sur un thème sombre,
  // l'inverse du thème clair) — et des fonds très sombres et peu saturés
  // pour bleuClair/bleuTresClair, symétrique à la logique claire.
  const darkBleu = hslVersHex({ ...bleuHsl, l: Math.min(70, Math.max(55, bleuHsl.l + 20)) });
  const darkBleuHover = hslVersHex({ ...bleuHsl, l: Math.min(80, Math.max(65, bleuHsl.l + 30)) });
  const darkBleuClair = hslVersHex({ ...bleuHsl, s: bleuHsl.s * 0.6, l: 22 });
  const darkBleuTresClair = hslVersHex({ ...bleuHsl, s: bleuHsl.s * 0.5, l: 14 });

  return {
    ...PALETTE_DEFAUT,
    light: {
      ...PALETTE_DEFAUT.light,
      bleu,
      bleuHover,
      bleuClair,
      bleuTresClair,
      navy,
      navyForte,
    },
    dark: {
      ...PALETTE_DEFAUT.dark,
      bleu: darkBleu,
      bleuHover: darkBleuHover,
      bleuClair: darkBleuClair,
      bleuTresClair: darkBleuTresClair,
    },
  };
}
