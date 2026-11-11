import { actionPourSejour, bornesDuJour, chambresIndisponibles, choixAcompteDe, montantAcompteRapide, sejoursDuJour } from "./sejours-du-jour";

// 11/11/2026 à 15:00 à Lubumbashi = 13:00 UTC. Le jour va de 10/11 22:00 UTC à 11/11 22:00 UTC.
const MAINTENANT = new Date("2026-11-11T13:00:00Z");
const s = (id: string, statut: string, arr: string, dep: string, chambreId = "c" + id) => ({ id, chambreId, statut, dateArrivee: arr, dateDepart: dep });

describe("sejoursDuJour", () => {
  it("sépare arrivées, départs et présents", () => {
    const liste = [
      s("1", "CONFIRMEE", "2026-11-11T10:00:00Z", "2026-11-14T10:00:00Z"),
      s("2", "EN_ATTENTE", "2026-11-11T10:00:00Z", "2026-11-12T10:00:00Z"),
      s("3", "EN_COURS", "2026-11-09T10:00:00Z", "2026-11-11T10:00:00Z"),
      s("4", "EN_COURS", "2026-11-10T10:00:00Z", "2026-11-13T10:00:00Z"),
      s("5", "CONFIRMEE", "2026-11-12T10:00:00Z", "2026-11-13T10:00:00Z"),
      s("6", "TERMINEE", "2026-11-08T10:00:00Z", "2026-11-10T10:00:00Z"),
    ];
    const r = sejoursDuJour(liste, MAINTENANT);
    expect(r.arrivees.map((x) => x.id)).toEqual(["1", "2"]);
    expect(r.departs.map((x) => x.id)).toEqual(["3"]);
    expect(r.presents.map((x) => x.id)).toEqual(["4"]);
  });
  it("garde une arrivée en retard dont le séjour court encore, pas celle dont le séjour est fini", () => {
    const r = sejoursDuJour([s("1", "CONFIRMEE", "2026-11-10T10:00:00Z", "2026-11-12T10:00:00Z"), s("2", "CONFIRMEE", "2026-11-08T10:00:00Z", "2026-11-10T10:00:00Z")], MAINTENANT);
    expect(r.arrivees.map((x) => x.id)).toEqual(["1"]);
  });
  it("un départ dépassé reste à facturer", () => {
    expect(sejoursDuJour([s("1", "EN_COURS", "2026-11-05T10:00:00Z", "2026-11-09T10:00:00Z")], MAINTENANT).departs).toHaveLength(1);
  });
  it("le jour suit Lubumbashi, pas UTC", () => {
    // 23:30 UTC le 11/11 = 01:30 le 12/11 à Lubumbashi
    const tard = new Date("2026-11-11T23:30:00Z");
    expect(new Date(bornesDuJour(tard).debut).toISOString()).toBe("2026-11-11T22:00:00.000Z");
  });
});

describe("actionPourSejour", () => {
  it("propose la bonne action selon l'état", () => {
    expect(actionPourSejour({ statut: "CONFIRMEE" }, { operer: true })?.id).toBe("checkin");
    expect(actionPourSejour({ statut: "EN_ATTENTE" }, { operer: true })?.id).toBe("confirmer");
    expect(actionPourSejour({ statut: "EN_ATTENTE" }, { operer: true, chambrePrise: true })).toBeNull();
    expect(actionPourSejour({ statut: "EN_COURS" }, { operer: true, departAujourdhui: true })?.id).toBe("facturer");
    expect(actionPourSejour({ statut: "EN_COURS" }, { operer: true })).toBeNull();
  });
  it("aucune action pour un patron qui ne peut pas opérer", () => {
    expect(actionPourSejour({ statut: "CONFIRMEE" }, { operer: false })).toBeNull();
  });
});

describe("chambresIndisponibles", () => {
  const liste = [s("1", "CONFIRMEE", "2026-11-12T10:00:00Z", "2026-11-14T10:00:00Z", "A"), s("2", "EN_COURS", "2026-11-10T10:00:00Z", "2026-11-12T10:00:00Z", "B"), s("3", "ANNULEE", "2026-11-11T10:00:00Z", "2026-11-15T10:00:00Z", "C")];
  it("signale réservée / occupée sur la période, ignore les annulées", () => {
    const m = chambresIndisponibles(liste, "2026-11-11T10:00:00Z", "2026-11-13T10:00:00Z");
    expect(m.get("A")).toBe("reservee");
    expect(m.get("B")).toBe("occupee");
    expect(m.has("C")).toBe(false);
  });
  it("un départ le jour de l'arrivée libère la chambre", () => {
    expect(chambresIndisponibles(liste, "2026-11-12T10:00:00Z", "2026-11-13T10:00:00Z").has("B")).toBe(false);
  });
});

describe("acompte rapide", () => {
  it("0, 50 %, tout", () => {
    expect(montantAcompteRapide(100, "aucun")).toBe(0);
    expect(montantAcompteRapide(105, "moitie")).toBe(52.5);
    expect(montantAcompteRapide(100, "tout")).toBe(100);
    expect(montantAcompteRapide(0, "tout")).toBe(0);
  });
  it("retrouve le bouton actif", () => {
    expect(choixAcompteDe(100, 0)).toBe("aucun");
    expect(choixAcompteDe(100, 50)).toBe("moitie");
    expect(choixAcompteDe(100, 100)).toBe("tout");
    expect(choixAcompteDe(100, 30)).toBeNull();
    expect(choixAcompteDe(100, NaN)).toBeNull();
  });
});
