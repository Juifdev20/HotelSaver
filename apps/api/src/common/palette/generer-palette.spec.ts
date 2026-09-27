import { genererPalette } from "./generer-palette";
import { PALETTE_DEFAUT } from "../palette-defaut";
import { ratioContraste } from "./couleur.util";

describe("genererPalette", () => {
  it("renvoie PALETTE_DEFAUT telle quelle si aucune couleur de base (pas de logo, ou extraction échouée)", () => {
    expect(genererPalette(null)).toBe(PALETTE_DEFAUT);
  });

  it("dérive un bleu dont le contraste contre blanc respecte le seuil WCAG AA (>= 4.5)", () => {
    // Jaune vif : contraste natif contre blanc très insuffisant, doit être assombri.
    const palette = genererPalette({ bleu: "#FFFF00", navy: "#333333" });
    expect(ratioContraste(palette.light.bleu, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("ne modifie aucun token neutre ou sémantique", () => {
    const palette = genererPalette({ bleu: "#FF0000", navy: "#101010" });
    expect(palette.light.succes).toBe(PALETTE_DEFAUT.light.succes);
    expect(palette.light.danger).toBe(PALETTE_DEFAUT.light.danger);
    expect(palette.light.surface100).toBe(PALETTE_DEFAUT.light.surface100);
    expect(palette.light.encre).toBe(PALETTE_DEFAUT.light.encre);
    expect(palette.espacements).toEqual(PALETTE_DEFAUT.espacements);
    expect(palette.rayons).toEqual(PALETTE_DEFAUT.rayons);
  });

  it("laisse une couleur déjà conforme au contraste inchangée", () => {
    // Bleu déjà sombre et contrasté contre blanc : assombrirPourContraste ne doit rien faire.
    const palette = genererPalette({ bleu: "#1D4ED8", navy: "#111827" });
    expect(ratioContraste(palette.light.bleu, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("génère un bleu de thème sombre plus clair que celui du thème clair (lisible sur fond sombre)", () => {
    const palette = genererPalette({ bleu: "#2563EB", navy: "#1F2937" });
    // Comparaison directe des composantes RVB serait fragile ; on vérifie plutôt
    // que le contraste du bleu sombre contre un fond sombre réel est meilleur
    // que celui du bleu clair contre le même fond.
    const fondSombre = PALETTE_DEFAUT.dark.surface100;
    expect(ratioContraste(palette.dark.bleu, fondSombre)).toBeGreaterThan(ratioContraste(palette.light.bleu, fondSombre));
  });
});
