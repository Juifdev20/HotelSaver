import { DELAI_MEME_CODE_MS, evaluerScan, type DernierScan } from "./anti-double-scan";

describe("anti-double-scan", () => {
  it("le premier scan est accepté", () => {
    expect(evaluerScan(null, "123", 1000)).toMatchObject({ accepte: true, aSignaler: false, suivant: { code: "123", le: 1000 } });
  });

  it("le même code relu tout de suite est ignoré ; le message n'est donné qu'une fois par série", () => {
    const premier = evaluerScan(null, "123", 1000).suivant;
    const second = evaluerScan(premier, "123", 1100);
    expect(second).toMatchObject({ accepte: false, aSignaler: true });
    const troisieme = evaluerScan(second.suivant, "123", 1200);
    expect(troisieme).toMatchObject({ accepte: false, aSignaler: false });
  });

  it("un AUTRE code passe toujours, même une fraction de seconde après", () => {
    const premier = evaluerScan(null, "123", 1000).suivant;
    expect(evaluerScan(premier, "456", 1010).accepte).toBe(true);
  });

  it("le même code est de nouveau accepté une fois la fenêtre écoulée", () => {
    const premier = evaluerScan(null, "123", 1000).suivant;
    expect(evaluerScan(premier, "123", 1000 + DELAI_MEME_CODE_MS).accepte).toBe(true);
    expect(evaluerScan(premier, "123", 1000 + DELAI_MEME_CODE_MS - 1).accepte).toBe(false);
  });

  it("tant que le code reste devant le lecteur, la fenêtre se prolonge (un seul ajout pour un article qu'on garde en vue)", () => {
    let d: DernierScan | null = evaluerScan(null, "123", 0).suivant;
    let acceptes = 1;
    for (let t = 500; t <= 10_000; t += 500) {
      const v = evaluerScan(d, "123", t);
      if (v.accepte) acceptes++;
      d = v.suivant;
    }
    expect(acceptes).toBe(1);
  });

  it("A, B, A en succession rapide : le second A est accepté (c'est un autre code entre-temps)", () => {
    const a = evaluerScan(null, "A", 0).suivant;
    const b = evaluerScan(a, "B", 200).suivant;
    expect(evaluerScan(b, "A", 400).accepte).toBe(true);
  });
});
