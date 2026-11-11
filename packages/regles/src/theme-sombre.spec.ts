import { styleClair, TABLE_FOND_SOMBRE, TABLE_TEXTE_SOMBRE, fondSombre, preferenceValide, schemaEffectif, styleSombre, texteSombre } from "./theme-sombre";

function luminance(hex: string): number {
  const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4));
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contraste = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("recoloration du mode sombre", () => {
  it("traduit les fonds de la charte et laisse les couleurs franches", () => {
    expect(fondSombre("#FFFFFF")).toBe("#172236");
    expect(fondSombre("#fff")).toBe("#172236");
    expect(fondSombre("#F6F8FC")).toBe("#0E1624");
    expect(fondSombre("#1769E0")).toBe("#1769E0"); // bouton bleu : le texte blanc garde son contraste
    expect(fondSombre("#C0281D")).toBe("#C0281D");
    expect(fondSombre("#053483")).toBe("#053483"); // bande de marque
  });
  it("traduit les textes sombres en textes clairs et laisse le blanc", () => {
    expect(texteSombre("#142033")).toBe("#E8EEF8");
    expect(texteSombre("#1769E0")).toBe("#6BA3FF");
    expect(texteSombre("#FFFFFF")).toBe("#FFFFFF");
    expect(texteSombre("#fff")).toBe("#fff");
  });
  it("ne touche ni aux rgba, ni à transparent, ni aux noms de couleur", () => {
    for (const c of ["rgba(15,39,66,0.4)", "transparent", "white", "black"]) {
      expect(fondSombre(c)).toBe(c);
      expect(texteSombre(c)).toBe(c);
    }
  });
  it("est idempotente : retraduire une couleur déjà sombre ne la change pas", () => {
    for (const v of Object.values(TABLE_FOND_SOMBRE)) expect(fondSombre(v)).toBe(v);
    for (const v of Object.values(TABLE_TEXTE_SOMBRE)) expect(texteSombre(v)).toBe(v);
  });
  it("traduit aussi une couleur hors charte (calcul de luminosité)", () => {
    const fond = fondSombre("#D8E1EE");
    expect(luminance(fond)).toBeLessThan(0.05);
    const texte = texteSombre("#3B4A63");
    expect(luminance(texte)).toBeGreaterThan(0.3);
  });
  it("garde un contraste lisible : texte de la charte sur les fonds sombres ≥ 4,5:1", () => {
    const fonds = ["#0E1624", "#172236", "#121C2D"];
    for (const texte of Object.values(TABLE_TEXTE_SOMBRE)) for (const fond of fonds) expect(contraste(texte, fond)).toBeGreaterThanOrEqual(4.5);
    // texte de la charte sur ses pastilles « claires » sombres
    expect(contraste(TABLE_TEXTE_SOMBRE["#0B7A48"], TABLE_FOND_SOMBRE["#ECFDF3"])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(TABLE_TEXTE_SOMBRE["#A85A00"], TABLE_FOND_SOMBRE["#FFFAEB"])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(TABLE_TEXTE_SOMBRE["#C0281D"], TABLE_FOND_SOMBRE["#FEF3F2"])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(TABLE_TEXTE_SOMBRE["#1769E0"], TABLE_FOND_SOMBRE["#EAF3FF"])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(TABLE_TEXTE_SOMBRE["#6941C6"], TABLE_FOND_SOMBRE["#F4F3FF"])).toBeGreaterThanOrEqual(4.5);
    // texte blanc sur un bouton franc
    expect(contraste("#FFFFFF", "#1769E0")).toBeGreaterThanOrEqual(4.5);
  });
  it("styleSombre traduit selon le rôle de la clé et copie le reste", () => {
    const style = { backgroundColor: "#FFFFFF", color: "#142033", borderColor: "#E4EAF2", padding: 8, shadowColor: "#000" };
    const s = styleSombre(style);
    expect(s).toEqual({ backgroundColor: "#172236", color: "#E8EEF8", borderColor: "#2A3850", padding: 8, shadowColor: "#000" });
    expect(style.backgroundColor).toBe("#FFFFFF"); // l'original n'est pas modifié
    expect(styleSombre({ color: "#fff" })).toEqual({ color: "#fff" }); // texte blanc : inchangé
    const sansCouleur = { padding: 4 };
    expect(styleSombre(sansCouleur)).toBe(sansCouleur); // rien à traduire : même objet
  });
  it("styleClair remet en clair les couleurs de la charte lues en mode sombre", () => {
    const sombre = styleSombre({ backgroundColor: "#FFFFFF", color: "#142033", borderColor: "#E4EAF2" });
    expect(styleClair(sombre)).toEqual({ backgroundColor: "#FFFFFF", color: "#142033", borderColor: "#E4EAF2" });
    expect(styleClair({ backgroundColor: "#1769E0", color: "#fff" })).toEqual({ backgroundColor: "#1769E0", color: "#fff" });
    const sansChangement = { padding: 2, color: "#142033" };
    expect(styleClair(sansChangement)).toBe(sansChangement);
  });
  it("choisit le schéma affiché : Auto suit le téléphone", () => {
    expect(schemaEffectif("auto", "dark")).toBe("sombre");
    expect(schemaEffectif("auto", "light")).toBe("clair");
    expect(schemaEffectif("auto", null)).toBe("clair");
    expect(schemaEffectif(null, "dark")).toBe("sombre");
    expect(schemaEffectif("clair", "dark")).toBe("clair");
    expect(schemaEffectif("sombre", "light")).toBe("sombre");
  });
  it("une préférence inconnue vaut Auto", () => {
    expect(preferenceValide("sombre")).toBe("sombre");
    expect(preferenceValide("rose")).toBe("auto");
    expect(preferenceValide(null)).toBe("auto");
  });
});
