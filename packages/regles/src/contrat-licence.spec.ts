import { CONTRAT_LICENCE_VERSION, blocsDuTexteContrat, genererContratLicence } from "./contrat-licence";

const editeur = { nom: "HotelSaver SARL", adresse: "Lubumbashi", rccm: "CD/LSH/RCCM/00-0000", nif: "A0000000X", representant: "Jean Test", fonction: "Gérant" };
const client = { nom: "Hôtel du Lac", adresse: "12 avenue du Lac, Lubumbashi", representant: "Marie Patron" };
const conditions = {
  numero: "LIC-2026-0001",
  annees: 2,
  debutLe: "2026-11-11T10:00:00Z",
  finLe: "2028-11-11T10:00:00Z",
  montant: 600,
  devise: "USD" as const,
  fraisMaintenanceUsd: 5,
  joursMaintenance: 30,
  joursGraceMaintenance: 2,
  joursPreavisMaintenance: 5,
  joursGraceAbonnement: 3,
  etabliLe: "2026-11-11T10:00:00Z",
};

describe("Contrat de licence et de maintenance", () => {
  it("dit ce que le logiciel fait vraiment : un seul hôtel, mises à jour comprises, maintenance, grâce et suspension", () => {
    const c = genererContratLicence(editeur, client, conditions);
    expect(c.version).toBe(CONTRAT_LICENCE_VERSION);
    expect(c.texte).toContain("N° LIC-2026-0001");
    expect(c.texte).toContain("UN SEUL hôtel, situé à 12 avenue du Lac, Lubumbashi");
    expect(c.texte).toContain("Toutes les mises à jour du logiciel publiées pendant la durée de la licence sont comprises");
    expect(c.texte).toContain("2 ans");
    expect(c.texte).toContain("600 $");
    expect(c.texte).toContain("5 $ par période de 30 jours");
    expect(c.texte).toContain("délai de 2 jours");
    expect(c.texte).toContain("5 jours avant chaque échéance");
    expect(c.texte).toContain("RCCM CD/LSH/RCCM/00-0000");
    expect(c.texte).toContain("Représentée par Jean Test, Gérant");
    expect(c.texte).toContain("Représenté par Marie Patron, patron");
  });

  it("est déterministe (même texte, octet pour octet) : l'empreinte enregistrée reste vérifiable", () => {
    expect(genererContratLicence(editeur, client, conditions).texte).toBe(genererContratLicence(editeur, client, conditions).texte);
  });

  it("n'invente rien : un champ inconnu est omis, un prix inconnu n'est pas affiché", () => {
    const c = genererContratLicence({ nom: "HotelSaver" }, { nom: "Hôtel X" }, { ...conditions, montant: null, devise: null });
    expect(c.texte).not.toContain("RCCM");
    expect(c.texte).not.toContain("undefined");
    expect(c.texte).not.toContain("null");
    expect(c.texte).toContain("à l'adresse déclarée lors de son inscription");
    expect(c.texte).toContain("Le prix de la licence a été payé");
  });

  it("une licence d'un an s'écrit au singulier", () => {
    expect(genererContratLicence(editeur, client, { ...conditions, annees: 1 }).texte).toContain("durée de 1 an,");
  });

  it("blocsDuTexteContrat repère titre, articles et paragraphes", () => {
    const blocs = blocsDuTexteContrat(genererContratLicence(editeur, client, conditions).texte);
    expect(blocs[0].type).toBe("titre");
    expect(blocs.filter((b) => b.type === "article").length).toBeGreaterThanOrEqual(14);
  });
});
