import { acomptesEncaisses, type ReservationPourRecette } from "./acomptes-encaisses";

const jour = { debut: "2026-11-13T00:00:00Z", fin: "2026-11-14T00:00:00Z" };
const base: ReservationPourRecette = { acompte: 180, devise: "USD", statut: "EN_COURS", origine: "RECEPTION", creePar: "rec1", creeLe: "2026-11-13T08:00:00Z" };

describe("acomptesEncaisses", () => {
  it("compte l'acompte d'un séjour payé d'avance (le cas de la capture : 180 $)", () => {
    expect(acomptesEncaisses([base], jour, "rec1")).toEqual({ montantUSD: 180, montantCDF: 0 });
  });
  it("sépare les devises, sans les fusionner", () => {
    const r = acomptesEncaisses([base, { ...base, acompte: 50000, devise: "CDF" }], jour, null);
    expect(r).toEqual({ montantUSD: 180, montantCDF: 50000 });
  });
  it("la réception ne voit que ce qu'elle a encaissé, le patron voit tout", () => {
    const autre = { ...base, creePar: "rec2", acompte: 20 };
    expect(acomptesEncaisses([base, autre], jour, "rec1").montantUSD).toBe(180);
    expect(acomptesEncaisses([base, autre], jour, null).montantUSD).toBe(200);
  });
  it("ignore les autres jours, les annulées, les acomptes en ligne et les acomptes à 0", () => {
    const l = [
      { ...base, creeLe: "2026-11-12T23:59:00Z" },
      { ...base, creeLe: "2026-11-14T00:00:00Z" },
      { ...base, statut: "ANNULEE" },
      { ...base, annulee: true },
      { ...base, origine: "SITE_PUBLIC" },
      { ...base, acompte: 0 },
      { ...base, creeLe: "undefined" },
    ];
    expect(acomptesEncaisses(l, jour, null)).toEqual({ montantUSD: 0, montantCDF: 0 });
  });
});
