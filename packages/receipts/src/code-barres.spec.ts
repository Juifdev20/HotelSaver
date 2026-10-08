import {
  DetecteurRafale,
  cleControleEan13,
  construireEtiquette,
  estEan13Valide,
  genererEan13Interne,
  trouverProduitParCode,
} from "./code-barres";
import { commandesCodeBarre, genererCommandesEscPos } from "./esc-pos";
import { TypeProduit } from "@hotel-chicago/types";

describe("EAN-13", () => {
  it("calcule la clé de contrôle de codes réels", () => {
    expect(cleControleEan13("400638133393")).toBe(1); // 4006381333931
    expect(cleControleEan13("590123412345")).toBe(7); // 5901234123457
    expect(estEan13Valide("4006381333931")).toBe(true);
    expect(estEan13Valide("4006381333932")).toBe(false);
  });

  it("génère un code interne de 13 chiffres, préfixe 2, clé valide", () => {
    for (let i = 0; i < 50; i++) {
      const code = genererEan13Interne();
      expect(code).toMatch(/^2\d{12}$/);
      expect(estEan13Valide(code)).toBe(true);
    }
  });
});

describe("trouverProduitParCode", () => {
  const produits = [
    { id: "a", codeBarres: "4006381333931", actif: true, typeProduit: TypeProduit.ARTICLE },
    { id: "b", codeBarres: "2000000000008", actif: false, typeProduit: TypeProduit.ARTICLE },
    { id: "c", codeBarres: "2000000000015", actif: true, typeProduit: TypeProduit.PLAT },
  ];

  it("trouve un article actif, espaces ignorés", () => {
    expect(trouverProduitParCode(produits, " 4006 381333931 ")?.id).toBe("a");
  });

  it("ignore les produits inactifs et les plats", () => {
    expect(trouverProduitParCode(produits, "2000000000008")).toBeUndefined();
    expect(trouverProduitParCode(produits, "2000000000015")).toBeUndefined();
  });
});

describe("DetecteurRafale", () => {
  function taper(detecteur: DetecteurRafale, texte: string, debut: number, intervalle: number): string | null {
    let t = debut;
    for (const c of texte) detecteur.touche(c, (t += intervalle));
    return detecteur.touche("Enter", t + intervalle);
  }

  it("reconnaît une rafale de douchette terminée par Entrée", () => {
    expect(taper(new DetecteurRafale(), "4006381333931", 1000, 8)).toBe("4006381333931");
  });

  it("ignore une frappe humaine lente", () => {
    expect(taper(new DetecteurRafale(), "fanta1", 1000, 180)).toBeNull();
  });

  it("ignore un code trop court", () => {
    expect(taper(new DetecteurRafale(), "123", 1000, 8)).toBeNull();
  });
});

describe("commandes ESC/POS du code-barres", () => {
  it("EAN-13 : GS k 67 13 suivi des 13 chiffres", () => {
    const octets = commandesCodeBarre("4006381333931");
    const debut = octets.indexOf(0x6b) - 1;
    expect(octets.slice(debut, debut + 4)).toEqual([0x1d, 0x6b, 67, 13]);
    expect(String.fromCharCode(...octets.slice(debut + 4, debut + 17))).toBe("4006381333931");
    // hauteur 80, module 2, chiffres sous les barres
    expect(octets).toEqual(expect.arrayContaining([0x1d, 0x68, 80, 0x1d, 0x77, 2, 0x1d, 0x48, 2]));
  });

  it("code non EAN : Code128 jeu B avec longueur préfixée", () => {
    const octets = commandesCodeBarre("ABC-12");
    const debut = octets.indexOf(73) - 2;
    expect(octets.slice(debut, debut + 6)).toEqual([0x1d, 0x6b, 73, 8, 0x7b, 0x42]);
  });

  it("une étiquette passe dans l'encodeur complet", () => {
    const lignes = construireEtiquette({ nom: "Fanta 33 cl", prix: "1.5", devise: "USD" as any, codeBarres: "4006381333931" }, 2);
    expect(lignes.filter((l) => l.type === "codebarre")).toHaveLength(2);
    const octets = genererCommandesEscPos(lignes);
    expect(Array.from(octets.slice(-3))).toEqual([0x1d, 0x56, 0x01]);
  });

  it("refuse d'imprimer l'étiquette d'un produit sans code", () => {
    expect(() => construireEtiquette({ nom: "X", prix: "1", devise: "USD" as any, codeBarres: null })).toThrow();
  });
});
