import { decrireChangement, messageLisible } from "./libelles";

describe("decrireChangement : texte lisible pour l'écran Synchronisation", () => {
  const reservation = {
    chambreId: "98e378ed-346c-40f2-98f9-31f6a0175069",
    dateArrivee: "2026-10-20T10:00:00.000Z",
    dateDepart: "2026-10-21T10:00:00.000Z",
    acompte: undefined,
    note: undefined,
    installerImmediatement: undefined,
    client: { nom: "Benjamin Paluku", telephone: "+243812345678" },
    clientLocalId: "780e41d6-a2a1-429b-8dba-7fbec3f80b7b",
  };

  it("ne montre ni identifiant brut, ni « undefined », ni « [object Object] »", () => {
    const texte = decrireChangement(reservation);
    expect(texte).toBe("Date d'arrivée : 20/10/2026 · Date de départ : 21/10/2026 · Client : Benjamin Paluku");
    expect(texte).not.toMatch(/undefined|object Object|98e378ed|780e41d6/);
  });

  it("traduit un identifiant connu en nom (« Chambre : 105 »)", () => {
    expect(decrireChangement({ chambreId: "ch-1", statut: "LIBRE" }, { "ch-1": "105" })).toBe("Chambre : 105 · Statut : Libre");
  });

  it("garde les champs vides volontaires et les booléens", () => {
    expect(decrireChangement({ notes: "", installerImmediatement: true })).toBe("Notes : (vide) · Arrivée immédiate (check-in) : Oui");
  });

  it("message d'erreur : jamais de JSON brut", () => {
    expect(messageLisible('{"message":"Chambre déjà réservée"}')).toBe("Chambre déjà réservée");
    expect(messageLisible('{"statusCode":500}', "Refusée.")).toBe("Refusée.");
  });
});
