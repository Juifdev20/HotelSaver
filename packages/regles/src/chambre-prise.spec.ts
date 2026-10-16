import { demandesSurChambrePrise } from "./chambre-prise";

const r = (id: string, chambreId: string, statut: string, a: string, d: string) => ({ id, chambreId, statut, dateArrivee: a, dateDepart: d });

describe("demandesSurChambrePrise", () => {
  it("signale la demande dont la chambre est déjà confirmée sur ces dates", () => {
    const l = [r("payee", "c1", "CONFIRMEE", "2026-11-10", "2026-11-13"), r("autre", "c1", "EN_ATTENTE", "2026-11-12", "2026-11-14")];
    expect([...demandesSurChambrePrise(l)]).toEqual(["autre"]);
  });
  it("une chambre occupée (EN_COURS) bloque aussi", () => {
    expect(demandesSurChambrePrise([r("a", "c1", "EN_COURS", "2026-11-01", "2026-11-05"), r("b", "c1", "EN_ATTENTE", "2026-11-04", "2026-11-06")]).has("b")).toBe(true);
  });
  it("le jour de départ est libre : arrivée le jour du départ de l'autre = pas de conflit", () => {
    expect(demandesSurChambrePrise([r("a", "c1", "CONFIRMEE", "2026-11-01", "2026-11-05"), r("b", "c1", "EN_ATTENTE", "2026-11-05", "2026-11-07")]).size).toBe(0);
  });
  it("autre chambre, autre période, ou autre demande en attente : aucun conflit", () => {
    const l = [r("a", "c1", "CONFIRMEE", "2026-11-01", "2026-11-05"), r("b", "c2", "EN_ATTENTE", "2026-11-02", "2026-11-04"), r("c", "c1", "EN_ATTENTE", "2026-12-01", "2026-12-03"), r("d", "c1", "EN_ATTENTE", "2026-11-02", "2026-11-04"), r("e", "c1", "ANNULEE", "2026-11-02", "2026-11-04")];
    expect([...demandesSurChambrePrise(l)]).toEqual(["d"]); // d chevauche a ; les autres non
  });
  it("une réservation ne se bloque pas elle-même", () => {
    expect(demandesSurChambrePrise([r("a", "c1", "EN_ATTENTE", "2026-11-01", "2026-11-05")]).size).toBe(0);
  });
});
