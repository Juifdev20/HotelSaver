/** Petites fonctions de calcul colorimétrique (hex/HSL, contraste WCAG),
 * volontairement écrites à la main plutôt que d'ajouter une dépendance :
 * une vingtaine de lignes de maths, pas besoin d'une librairie de plus. */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexVersHsl(hex: string): Hsl {
  const { r, g, b } = hexVersRgb(hex);
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rN:
      h = ((gN - bN) / d + (gN < bN ? 6 : 0)) * 60;
      break;
    case gN:
      h = ((bN - rN) / d + 2) * 60;
      break;
    default:
      h = ((rN - gN) / d + 4) * 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslVersHex({ h, s, l }: Hsl): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const versHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${versHex(r)}${versHex(g)}${versHex(b)}`.toUpperCase();
}

export function hexVersRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Luminance relative WCAG 2.1 (contents.w3.org/TR/WCAG21/#dfn-relative-luminance). */
function luminanceRelative(hex: string): number {
  const { r, g, b } = hexVersRgb(hex);
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Ratio de contraste WCAG entre deux couleurs (1 à 21). */
export function ratioContraste(hexA: string, hexB: string): number {
  const lA = luminanceRelative(hexA);
  const lB = luminanceRelative(hexB);
  const [clair, sombre] = lA >= lB ? [lA, lB] : [lB, lA];
  return (clair + 0.05) / (sombre + 0.05);
}

/** Assombrit `hex` par paliers jusqu'à atteindre `cible` de contraste contre
 * `fond` (typiquement blanc), ou jusqu'à un plancher de luminosité (15%)
 * pour ne jamais produire un noir absolu. Ne fait rien si déjà conforme. */
export function assombrirPourContraste(hex: string, fond: string, cible = 4.5): string {
  let hsl = hexVersHsl(hex);
  let courant = hex;
  let iterations = 0;
  while (ratioContraste(courant, fond) < cible && hsl.l > 15 && iterations < 25) {
    hsl = { ...hsl, l: Math.max(15, hsl.l - 4) };
    courant = hslVersHex(hsl);
    iterations++;
  }
  return courant;
}
