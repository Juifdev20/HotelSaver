import { arrondirDevise, depuisCentimes, nombreDeNuits, objectifAcompte, resteAPayer, versCentimes } from "./calcul-acompte";

describe("calcul de l'acompte", () => {
  it("l'exemple du patron : chambre à 20 $ la nuit, 4 nuits, 30 % → 24 $", () => {
    expect(objectifAcompte({ prixParNuit: 20, nuits: 4, pourcentage: 30, devise: "USD" })).toBe(24);
    expect(objectifAcompte({ prixParNuit: 20, nuits: 4, pourcentage: 25, devise: "USD" })).toBe(20);
    expect(objectifAcompte({ prixParNuit: 20, nuits: 4, pourcentage: 100, devise: "USD" })).toBe(80);
  });

  it("arrondi vers le haut au cent (dollars) ou au franc entier (francs)", () => {
    expect(objectifAcompte({ prixParNuit: 33.33, nuits: 3, pourcentage: 33, devise: "USD" })).toBe(33); // 32,9967 → 33,00
    expect(objectifAcompte({ prixParNuit: 10.01, nuits: 1, pourcentage: 15, devise: "USD" })).toBe(1.51); // 1,5015 → 1,51
    expect(objectifAcompte({ prixParNuit: 45_000, nuits: 2, pourcentage: 33, devise: "CDF" })).toBe(29_700);
    expect(objectifAcompte({ prixParNuit: 45_001, nuits: 1, pourcentage: 33, devise: "CDF" })).toBe(14_851); // 14 850,33 → 14 851
  });

  it("pas d'acompte si le pourcentage ou le prix est nul, jamais plus que le séjour", () => {
    expect(objectifAcompte({ prixParNuit: 20, nuits: 4, pourcentage: 0, devise: "USD" })).toBe(0);
    expect(objectifAcompte({ prixParNuit: 0, nuits: 4, pourcentage: 30, devise: "USD" })).toBe(0);
    expect(objectifAcompte({ prixParNuit: 20, nuits: 4, pourcentage: 250, devise: "USD" })).toBe(80);
  });

  it("nuits : au moins une, arrondi au jour", () => {
    expect(nombreDeNuits(new Date("2026-10-12T14:00:00Z"), new Date("2026-10-16T11:00:00Z"))).toBe(4);
    expect(nombreDeNuits(new Date("2026-10-12T14:00:00Z"), new Date("2026-10-12T20:00:00Z"))).toBe(1);
  });

  it("reste à payer, sans erreur de virgule flottante", () => {
    expect(resteAPayer(24, 0, "USD")).toBe(24);
    expect(resteAPayer(24, 9.1, "USD")).toBe(14.9);
    expect(resteAPayer(24, 30, "USD")).toBe(0);
    expect(resteAPayer(29_700, 0.5, "CDF")).toBe(29_700); // les francs sont entiers
  });

  it("centimes", () => {
    expect(versCentimes(14.9)).toBe(1490);
    expect(versCentimes(0.1 + 0.2)).toBe(30);
    expect(depuisCentimes(2450)).toBe(24.5);
    expect(depuisCentimes(null)).toBeNull();
    expect(arrondirDevise(1.005, "USD")).toBe(1.01);
  });
});
