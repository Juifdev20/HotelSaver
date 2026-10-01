import { bornesDuMois, libelleMois } from "./bornes";

describe("bornesDuMois — fuseau Africa/Lubumbashi (UTC+2)", () => {
  it("couvre septembre 2026 exactement, en instants UTC", () => {
    const b = bornesDuMois("2026-09", new Date("2026-10-05T12:00:00Z"));
    // Minuit du 1er septembre à Lubumbashi = 22:00 UTC du 31 août.
    expect(b.debut.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(b.fin.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(b.libelle).toBe("septembre 2026");
    expect(b.plage).toBe("du 01/09/2026 au 30/09/2026");
    expect(b.enCours).toBe(false);
  });

  it("passage d'année : décembre 2026 finit le 31 déc à minuit local", () => {
    const b = bornesDuMois("2026-12", new Date("2027-01-02T00:00:00Z"));
    expect(b.debut.toISOString()).toBe("2026-11-30T22:00:00.000Z");
    expect(b.fin.toISOString()).toBe("2026-12-31T22:00:00.000Z");
    expect(b.plage).toBe("du 01/12/2026 au 31/12/2026");
    expect(b.enCours).toBe(false);
  });

  it("le mois en cours est marqué provisoire (fin dans le futur)", () => {
    const b = bornesDuMois("2026-10", new Date("2026-10-01T06:00:00Z"));
    expect(b.enCours).toBe(true);
    // Et passé minuit du lendemain du mois suivant, il ne l'est plus.
    expect(bornesDuMois("2026-10", new Date("2026-11-01T12:00:00Z")).enCours).toBe(false);
  });

  it("refuse un format invalide et un mois impossible", () => {
    expect(() => bornesDuMois("2026-13")).toThrow();
    expect(() => bornesDuMois("09-2026")).toThrow();
    expect(() => bornesDuMois("")).toThrow();
  });
});

describe("libelleMois", () => {
  it("formate le mois en français", () => {
    expect(libelleMois("2026-01")).toBe("janvier 2026");
    expect(libelleMois("2026-10")).toBe("octobre 2026");
  });
});
