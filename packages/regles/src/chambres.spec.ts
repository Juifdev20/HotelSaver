import { actionPourChambre, comparerNumeros, compterParStatut, sejoursParChambre, typesDeChambres, type SejourLu } from "./chambres";

const sejour = (id: string, chambreId: string, statut: string, a: string, d: string, nom = "Client"): SejourLu => ({ id, chambreId, statut, dateArrivee: a, dateDepart: d, client: { nom } });
const MAINTENANT = new Date("2026-11-11T10:00:00Z");

describe("séjours par chambre", () => {
  it("le séjour EN_COURS est celui qui occupe la chambre ; le prochain est le plus proche des séjours CONFIRMÉS à venir", () => {
    const map = sejoursParChambre(
      [
        sejour("a", "c1", "EN_COURS", "2026-11-10T08:00:00Z", "2026-11-13T08:00:00Z", "Jean"),
        sejour("b", "c1", "CONFIRMEE", "2026-11-20T08:00:00Z", "2026-11-22T08:00:00Z", "Plus tard"),
        sejour("c", "c1", "CONFIRMEE", "2026-11-14T08:00:00Z", "2026-11-16T08:00:00Z", "Paul"),
        sejour("d", "c2", "CONFIRMEE", "2026-11-13T08:00:00Z", "2026-11-15T08:00:00Z", "Marie"),
      ],
      MAINTENANT
    );
    expect(map.get("c1")?.enCours?.client.nom).toBe("Jean");
    expect(map.get("c1")?.prochaine?.client.nom).toBe("Paul");
    expect(map.get("c2")?.prochaine?.client.nom).toBe("Marie");
    expect(map.get("c2")?.enCours).toBeUndefined();
  });

  it("ignore les demandes en attente, les séjours terminés ou annulés et les confirmés déjà passés", () => {
    const map = sejoursParChambre(
      [
        sejour("a", "c1", "EN_ATTENTE", "2026-11-13T08:00:00Z", "2026-11-14T08:00:00Z"),
        sejour("b", "c1", "TERMINEE", "2026-11-01T08:00:00Z", "2026-11-03T08:00:00Z"),
        sejour("c", "c1", "ANNULEE", "2026-11-15T08:00:00Z", "2026-11-16T08:00:00Z"),
        sejour("d", "c1", "CONFIRMEE", "2026-11-01T08:00:00Z", "2026-11-05T08:00:00Z"),
      ],
      MAINTENANT
    );
    expect(map.get("c1")?.enCours).toBeUndefined();
    expect(map.get("c1")?.prochaine).toBeUndefined();
  });
});

describe("la bonne action selon l'état de la chambre", () => {
  const enCours = { enCours: sejour("a", "c1", "EN_COURS", "2026-11-10T08:00:00Z", "2026-11-13T08:00:00Z") };
  const prochaine = { prochaine: sejour("b", "c1", "CONFIRMEE", "2026-11-14T08:00:00Z", "2026-11-16T08:00:00Z") };

  it("Libre → arrivée ; Occupée → facturer et départ ; Réservée → voir ; Nettoyage → marquer propre", () => {
    expect(actionPourChambre({ statut: "LIBRE" }, undefined, true)?.id).toBe("arrivee");
    expect(actionPourChambre({ statut: "OCCUPEE" }, enCours, true)?.id).toBe("depart");
    expect(actionPourChambre({ statut: "RESERVEE" }, prochaine, true)?.id).toBe("voir");
    expect(actionPourChambre({ statut: "NETTOYAGE" }, undefined, true)?.id).toBe("propre");
    expect(actionPourChambre({ statut: "LIBRE" }, undefined, true)?.libelleCourt).toBe("Arrivée");
  });

  it("le patron qui ne peut pas opérer ne voit que la consultation (Voir le séjour)", () => {
    expect(actionPourChambre({ statut: "LIBRE" }, undefined, false)).toBeNull();
    expect(actionPourChambre({ statut: "OCCUPEE" }, enCours, false)).toBeNull();
    expect(actionPourChambre({ statut: "NETTOYAGE" }, undefined, false)).toBeNull();
    expect(actionPourChambre({ statut: "RESERVEE" }, prochaine, false)?.id).toBe("voir");
  });

  it("aucune action sans séjour connu (chambre passée Occupée ou Réservée à la main)", () => {
    expect(actionPourChambre({ statut: "OCCUPEE" }, undefined, true)).toBeNull();
    expect(actionPourChambre({ statut: "RESERVEE" }, undefined, true)).toBeNull();
  });
});

describe("comptes et tri", () => {
  const chambres = [
    { id: "1", numero: "101", type: "Simple", statut: "LIBRE" },
    { id: "2", numero: "102", type: "Simple", statut: "OCCUPEE" },
    { id: "3", numero: "10", type: "Double", statut: "LIBRE" },
    { id: "4", numero: "9", type: " Suite ", statut: "NETTOYAGE" },
  ];
  it("compte par statut et par type", () => {
    expect(compterParStatut(chambres)).toEqual({ TOUTES: 4, LIBRE: 2, OCCUPEE: 1, RESERVEE: 0, NETTOYAGE: 1 });
    expect(typesDeChambres(chambres)).toEqual([{ type: "Double", nombre: 1 }, { type: "Simple", nombre: 2 }, { type: "Suite", nombre: 1 }]);
  });
  it("ordre naturel des numéros", () => {
    expect([...chambres].sort((a, b) => comparerNumeros(a.numero, b.numero)).map((c) => c.numero)).toEqual(["9", "10", "101", "102"]);
  });
});
