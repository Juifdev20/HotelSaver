import { BadRequestException } from "@nestjs/common";
import { Devise } from "@hotel-chicago/database";
import { calculerEncaissement } from "./encaissement.util";

describe("calculerEncaissement", () => {
  it("ne calcule rien pour un paiement exact sans détail de règlement croisé", () => {
    expect(calculerEncaissement({ montantDu: 45, deviseDue: Devise.USD })).toEqual({});
  });

  it("calcule la monnaie dans la même devise que le règlement", () => {
    const resultat = calculerEncaissement({
      montantDu: 45,
      deviseDue: Devise.USD,
      deviseRegleeParClient: Devise.USD,
      montantRegleParClient: 50,
    });
    expect(resultat.deviseMonnaieRendue).toBe(Devise.USD);
    expect(resultat.montantMonnaieRendue).toBe(5);
    expect(resultat.tauxChangeApplique).toBeUndefined();
  });

  it("refuse un montant remis insuffisant", () => {
    expect(() =>
      calculerEncaissement({
        montantDu: 45,
        deviseDue: Devise.USD,
        deviseRegleeParClient: Devise.USD,
        montantRegleParClient: 40,
      })
    ).toThrow(BadRequestException);
  });

  it("refuse un paiement croisé sans taux de change configuré", () => {
    expect(() =>
      calculerEncaissement({
        montantDu: 45,
        deviseDue: Devise.USD,
        deviseRegleeParClient: Devise.CDF,
        montantRegleParClient: 130000,
      })
    ).toThrow(BadRequestException);
  });

  it("calcule un paiement croisé USD dû réglé en CDF, monnaie rendue en CDF", () => {
    // Dû : 45 $ ; taux 2800 CDF/$ => 126 000 CDF dus ; client remet 130 000 CDF.
    const resultat = calculerEncaissement({
      montantDu: 45,
      deviseDue: Devise.USD,
      deviseRegleeParClient: Devise.CDF,
      montantRegleParClient: 130000,
      cdfParUsd: 2800,
    });
    expect(resultat.deviseMonnaieRendue).toBe(Devise.CDF);
    expect(resultat.montantMonnaieRendue).toBe(4000);
    expect(resultat.tauxChangeApplique).toBe(2800);
  });

  it("calcule un paiement croisé avec monnaie rendue dans une troisième devise choisie par le caissier", () => {
    // Dû : 45 $ réglé en 130 000 CDF (taux 2800), mais le caissier rend la monnaie en USD.
    // Monnaie en CDF = 4 000 CDF ; convertie en USD = 4000 / 2800 ≈ 1.43 $.
    const resultat = calculerEncaissement({
      montantDu: 45,
      deviseDue: Devise.USD,
      deviseRegleeParClient: Devise.CDF,
      montantRegleParClient: 130000,
      deviseRenduChoisie: Devise.USD,
      cdfParUsd: 2800,
    });
    expect(resultat.deviseMonnaieRendue).toBe(Devise.USD);
    expect(resultat.montantMonnaieRendue).toBeCloseTo(1.43, 2);
  });

  it("arrondit les francs congolais rendus à l'unité (jamais de décimales)", () => {
    const resultat = calculerEncaissement({
      montantDu: 20000,
      deviseDue: Devise.CDF,
      deviseRegleeParClient: Devise.CDF,
      montantRegleParClient: 20333.7,
    });
    expect(Number.isInteger(resultat.montantMonnaieRendue)).toBe(true);
  });
});
