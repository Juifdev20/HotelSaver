import { repartirEnParts } from "./partage.util";

describe("repartirEnParts", () => {
  it("répartit un montant qui se divise exactement", () => {
    expect(repartirEnParts(100, 2, 4)).toEqual([25, 25, 25, 25]);
  });

  it("distribue le reste aux premières parts sans perdre de centimes (USD)", () => {
    const parts = repartirEnParts(10, 2, 3); // 10 / 3 = 3.33... -> 3.34 + 3.33 + 3.33
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 2);
    expect(parts[0]).toBeCloseTo(3.34, 2);
    expect(parts[1]).toBeCloseTo(3.33, 2);
    expect(parts[2]).toBeCloseTo(3.33, 2);
  });

  it("répartit des francs congolais entiers sans décimales", () => {
    const parts = repartirEnParts(100000, 0, 3); // 100000 / 3 = 33333.33...
    expect(parts.every((p) => Number.isInteger(p))).toBe(true);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100000);
  });
});
