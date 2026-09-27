import { calculerFinValidite, DUREE_ESSAI_JOURS } from "./calculer-validite";

describe("calculerFinValidite", () => {
  it("sans paiement, renvoie createdAt + 14 jours (essai)", () => {
    const createdAt = new Date("2026-09-01T00:00:00.000Z");
    const resultat = calculerFinValidite({ createdAt }, null);

    const attendu = new Date(createdAt);
    attendu.setDate(attendu.getDate() + DUREE_ESSAI_JOURS);
    expect(resultat).toEqual(attendu);
  });

  it("avec un paiement, renvoie sa periodeCouverteJusquau, pas la date d'essai", () => {
    const createdAt = new Date("2026-09-01T00:00:00.000Z");
    const periodeCouverteJusquau = new Date("2027-01-01T00:00:00.000Z");

    const resultat = calculerFinValidite({ createdAt }, { periodeCouverteJusquau });

    expect(resultat).toEqual(periodeCouverteJusquau);
  });
});
