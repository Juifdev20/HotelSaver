import { lireMontant, lireQuantite, lireTauxChange } from "./saisie";

const ok = (r: { ok: boolean; valeur?: number }) => (r.ok ? r.valeur : "ERREUR");

describe("lireMontant", () => {
  it.each([
    ["10.000", "CDF", 10000],
    ["10,000", "CDF", 10000],
    ["1 000", "CDF", 1000],
    ["1.000.000", "CDF", 1000000],
    ["280.000", "CDF", 280000],
    ["12,5", "USD", 12.5],
    ["12.50", "USD", 12.5],
    ["3.75", "USD", 3.75],
    ["1.250,50", "USD", 1250.5],
    ["1,250.50", "USD", 1250.5],
    ["1.500", "USD", 1500],
    ["0,5", "USD", 0.5],
    ["0.500", "USD", 0.5],
    ["45", "USD", 45],
    ["1 200", "CDF", 1200],
  ] as const)("« %s » en %s = %s", (saisie, devise, attendu) => {
    expect(ok(lireMontant(saisie, devise))).toBe(attendu);
  });

  it.each([
    ["", "USD"], ["abc", "USD"], ["-5", "USD"], ["0", "USD"], ["1.2345", "USD"], ["12,555", "CDF" /* 12555 ok */],
    ["1,5", "CDF"], ["12.5.5", "USD"], ["1..2", "USD"], ["10.00,0,0", "USD"], ["1e5", "USD"], ["5$", "USD"],
  ] as const)("« %s » en %s est refusé (sauf cas reconnu)", (saisie, devise) => {
    const r = lireMontant(saisie, devise);
    if (saisie === "12,555") expect(ok(r)).toBe(12555);
    else expect(r.ok).toBe(false);
  });

  it("le zéro n'est accepté que sur demande", () => {
    expect(lireMontant("0", "USD", { autoriserZero: true })).toEqual({ ok: true, valeur: 0 });
  });

  it("refuse un montant aberrant au-dessus du maximum", () => {
    expect(lireMontant("999999999", "USD", { max: 1_000_000 }).ok).toBe(false);
  });

  it("un montant en dollars n'a que deux décimales, un montant en francs aucune", () => {
    expect(lireMontant("1,234", "USD")).toEqual({ ok: true, valeur: 1234 }); // trois chiffres = milliers
    expect(lireMontant("12,345,6", "USD").ok).toBe(false);
    expect(lireMontant("2,50", "CDF").ok).toBe(false);
  });
});

describe("lireQuantite", () => {
  it.each([["2", 2], ["1,5", 1.5], ["1.5", 1.5], ["0,25", 0.25], ["10", 10]] as const)("« %s » = %s", (saisie, attendu) => {
    expect(ok(lireQuantite(saisie))).toBe(attendu);
  });
  it.each(["", "-1", "abc", "0", "1,2345", "1.000.0"])("« %s » est refusée", (saisie) => {
    expect(lireQuantite(saisie).ok).toBe(false);
  });
  it("peut exiger un entier", () => {
    expect(lireQuantite("1,5", { entier: true }).ok).toBe(false);
    expect(lireQuantite("3", { entier: true })).toEqual({ ok: true, valeur: 3 });
  });
});

describe("lireTauxChange", () => {
  it("lit « 2.800 » comme 2 800 et pas comme 2,8", () => {
    expect(lireTauxChange("2.800")).toEqual({ ok: true, valeur: 2800 });
    expect(lireTauxChange("2 800,50")).toEqual({ ok: true, valeur: 2800.5 });
  });
  it("refuse un taux hors fourchette", () => {
    expect(lireTauxChange("2,8").ok).toBe(false);
    expect(lireTauxChange("280000").ok).toBe(false);
  });
});
