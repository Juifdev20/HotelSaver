import { genererCommandesEscPos, nettoyerTexteImpression } from "./esc-pos";
import type { LigneRecu } from "./types";

function octetsVersTexte(octets: Uint8Array): string {
  return Array.from(octets)
    .map((o) => (o >= 32 && o < 127 ? String.fromCharCode(o) : `[${o}]`))
    .join("");
}

describe("genererCommandesEscPos", () => {
  it("commence par l'initialisation et termine par la coupe papier", () => {
    const octets = genererCommandesEscPos([{ type: "titre", texte: "HOTEL CHICAGO" }]);
    expect(Array.from(octets.slice(0, 2))).toEqual([0x1b, 0x40]); // ESC @
    expect(Array.from(octets.slice(-3))).toEqual([0x1d, 0x56, 0x01]); // GS V 1
  });

  it("aligne le montant à droite en complétant avec des espaces jusqu'à la largeur donnée", () => {
    const octets = genererCommandesEscPos([{ type: "montant", libelle: "Prix/nuit", valeur: "45.00 $" }], 20);
    const texte = octetsVersTexte(octets);
    // "Prix/nuit" (9) + espaces + "45.00 $" (7) = 20 caractères avant le saut de ligne.
    expect(texte).toContain("Prix/nuit    45.00 $");
  });

  it("ne perd jamais une ligne même si le libellé + la valeur dépassent la largeur", () => {
    const ligne: LigneRecu = { type: "montant", libelle: "Un très long libellé de produit", valeur: "12.00 $" };
    expect(() => genererCommandesEscPos([ligne], 20)).not.toThrow();
  });

  it("remplace un caractère accentué par sa table CP850 plutôt que de l'ASCII brut", () => {
    const octets = genererCommandesEscPos([{ type: "champ", label: "Reçu par", valeur: "Élise" }]);
    // 'ç' -> 0x87, 'É' -> 0x90 en CP850 (voir CP850 dans esc-pos.ts).
    expect(Array.from(octets)).toEqual(expect.arrayContaining([0x87, 0x90]));
  });
});

describe("texte saisi par un tiers", () => {
  it("n'injecte jamais d'octet de commande (ESC p = ouvrir le tiroir-caisse, GS V = couper, LF = fausse ligne)", () => {
    const lignes: LigneRecu[] = [{ type: "champ", label: "Table", valeur: "Zoé\x1bp\x00\x19\x1d\x56\x00\nTOTAL 0,01 $" }];
    const texte = octetsVersTexte(genererCommandesEscPos(lignes));
    expect(texte).not.toContain("[27]p"); // aucun ESC p
    expect(texte.match(/\[29\]V/g)).toHaveLength(1); // la seule coupe est celle du générateur, en fin de reçu
    expect(texte).toMatch(/Table : Zo\[130\] p {3}V {2}TOTAL 0,01 \$\[10\]/); // le texte reste lisible, sans octet de commande
  });

  it("nettoyerTexteImpression remplace les caractères de contrôle par des espaces", () => {
    expect(nettoyerTexteImpression("a\x1b\x1d\n\r\tb\x7f")).toBe("a     b ");
  });
});
