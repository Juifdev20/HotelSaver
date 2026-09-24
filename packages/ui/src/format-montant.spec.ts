import { Devise } from "@hotel-chicago/types";
import { formatMontant } from "./format-montant";

describe("formatMontant", () => {
  it("formate l'USD avec toujours 2 décimales et le symbole $ après le montant", () => {
    expect(formatMontant(45, Devise.USD)).toBe("45.00 $");
    expect(formatMontant(45.5, Devise.USD)).toBe("45.50 $");
    expect(formatMontant(3, Devise.USD)).toBe("3.00 $");
  });

  it("formate le CDF sans décimales, avec des espaces comme séparateurs de milliers, jamais de symbole $", () => {
    expect(formatMontant(20000, Devise.CDF)).toBe("20 000 FC");
    expect(formatMontant(540000, Devise.CDF)).toBe("540 000 FC");
    expect(formatMontant(5000, Devise.CDF)).toBe("5 000 FC");
    expect(formatMontant(500, Devise.CDF)).toBe("500 FC");
  });

  it("arrondit un CDF avec décimales plutôt que de les afficher", () => {
    expect(formatMontant(20000.7, Devise.CDF)).toBe("20 001 FC");
  });

  it("accepte une chaîne (les Decimal Prisma sont sérialisés en string sur le fil)", () => {
    expect(formatMontant("45", Devise.USD)).toBe("45.00 $");
    expect(formatMontant("20000", Devise.CDF)).toBe("20 000 FC");
  });

  it("lève une erreur explicite pour un montant non numérique plutôt que d'afficher NaN", () => {
    expect(() => formatMontant("abc", Devise.USD)).toThrow(/montant invalide/);
  });
});
