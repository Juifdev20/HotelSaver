import { ErreurRegle, calculerEncaissement, genererCodePoste, jourCompact, nuitees, numeroRecuProvisoire, repartirEnParts, sechevauchent, sommerParDevise, totauxFactureSejour, estRecuProvisoire } from "./index";

describe("calculerEncaissement", () => {
  it("ne calcule rien pour un paiement exact", () => expect(calculerEncaissement({ montantDu: 45, deviseDue: "USD" })).toEqual({}));

  it("rend la monnaie dans la devise du règlement", () => {
    const r = calculerEncaissement({ montantDu: 45, deviseDue: "USD", deviseRegleeParClient: "USD", montantRegleParClient: 50 });
    expect(r).toMatchObject({ deviseMonnaieRendue: "USD", montantMonnaieRendue: 5 });
    expect(r.tauxChangeApplique).toBeUndefined();
  });

  it("refuse un montant insuffisant, avec un message affichable", () => {
    expect(() => calculerEncaissement({ montantDu: 45, deviseDue: "USD", deviseRegleeParClient: "USD", montantRegleParClient: 40 })).toThrow(ErreurRegle);
    expect(() => calculerEncaissement({ montantDu: 45, deviseDue: "USD", deviseRegleeParClient: "USD", montantRegleParClient: 40 })).toThrow(/insuffisant/);
  });

  it("paiement croisé : dû en USD, payé en CDF, monnaie rendue en CDF au taux du jour", () => {
    const r = calculerEncaissement({ montantDu: 10, deviseDue: "USD", deviseRegleeParClient: "CDF", montantRegleParClient: 30000, cdfParUsd: 2800 });
    expect(r).toEqual({ deviseMonnaieRendue: "CDF", montantMonnaieRendue: 2000, tauxChangeApplique: 2800 });
  });

  it("monnaie rendue dans l'autre devise que celle du règlement", () => {
    const r = calculerEncaissement({ montantDu: 10, deviseDue: "USD", deviseRegleeParClient: "CDF", montantRegleParClient: 30000, deviseRenduChoisie: "USD", cdfParUsd: 2800 });
    expect(r.deviseMonnaieRendue).toBe("USD");
    expect(r.montantMonnaieRendue).toBeCloseTo(0.71, 2);
  });

  it("refuse un paiement croisé sans taux de change", () => {
    expect(() => calculerEncaissement({ montantDu: 10, deviseDue: "USD", deviseRegleeParClient: "CDF", montantRegleParClient: 30000 })).toThrow(/taux de change/);
  });
});

describe("repartirEnParts / sommerParDevise", () => {
  it("ne perd aucun centime", () => {
    const parts = repartirEnParts(10, 2, 3);
    expect(parts).toEqual([3.34, 3.33, 3.33]);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 2);
  });
  it("francs entiers", () => expect(repartirEnParts(100000, 0, 3).every(Number.isInteger)).toBe(true));
  it("additionne par devise sans les mélanger", () => {
    expect(sommerParDevise([{ quantite: 2, prixUnitaire: "3.50", devise: "USD" }, { quantite: "1", prixUnitaire: 5000, devise: "CDF" }])).toEqual({ usd: 7, cdf: 5000 });
  });
});

describe("séjour", () => {
  it("nuitées : au moins une", () => {
    expect(nuitees("2026-10-10T08:00:00Z", "2026-10-10T20:00:00Z")).toBe(1);
    expect(nuitees("2026-10-10", "2026-10-13")).toBe(3);
  });
  it("totaux : chambre après acompte + consommations, par devise", () => {
    const t = totauxFactureSejour({ prixParNuit: 40, deviseChambre: "USD", dateArrivee: "2026-10-10", dateDepart: "2026-10-12", acompte: 30, consommations: [{ montantTotalUSD: 6, montantTotalCDF: 0 }, { montantTotalUSD: 0, montantTotalCDF: 8000 }] });
    expect(t).toMatchObject({ nuits: 2, montantChambre: 80, montantDuChambre: 50, montantTotalUSD: 56, montantTotalCDF: 8000, deviseDue: "USD", montantDu: 56 });
  });
  it("acompte supérieur au séjour : rien à payer pour la chambre", () => {
    expect(totauxFactureSejour({ prixParNuit: 40, deviseChambre: "USD", dateArrivee: "2026-10-10", dateDepart: "2026-10-11", acompte: 100, consommations: [] }).montantDuChambre).toBe(0);
  });
  it("chambre en CDF : dû en CDF", () => {
    expect(totauxFactureSejour({ prixParNuit: 100000, deviseChambre: "CDF", dateArrivee: "2026-10-10", dateDepart: "2026-10-11", acompte: 0, consommations: [] })).toMatchObject({ deviseDue: "CDF", montantDu: 100000 });
  });
  it("chevauchement : le départ du premier jour libère la chambre", () => {
    expect(sechevauchent({ dateArrivee: "2026-10-10", dateDepart: "2026-10-12" }, { dateArrivee: "2026-10-12", dateDepart: "2026-10-14" })).toBe(false);
    expect(sechevauchent({ dateArrivee: "2026-10-10", dateDepart: "2026-10-13" }, { dateArrivee: "2026-10-12", dateDepart: "2026-10-14" })).toBe(true);
  });
});

describe("reçu provisoire", () => {
  it("format TEMP-POSTE-JOUR-NNN", () => expect(numeroRecuProvisoire("AB12", "20261010", 7)).toBe("TEMP-AB12-20261010-007"));
  it("se reconnaît", () => {
    expect(estRecuProvisoire("TEMP-AB12-20261010-007")).toBe(true);
    expect(estRecuProvisoire("REC-20261010-0001")).toBe(false);
    expect(estRecuProvisoire(null)).toBe(false);
  });
  it("code poste : 4 caractères lisibles, deux appareils ne collisionnent pas en pratique", () => {
    const codes = new Set(Array.from({ length: 200 }, () => genererCodePoste()));
    expect(codes.size).toBeGreaterThan(190);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
  });
  it("jour à Lubumbashi (UTC+2)", () => expect(jourCompact(new Date("2026-10-10T23:30:00Z"))).toBe("20261011"));
});
