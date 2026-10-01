import { AgregatCafeteria, AgregatReception } from "../agregats/types";
import { rendreRapportCafeteria, ContexteRapportCafeteria } from "./cafeteria";
import { rendreRapportReception, ContexteRapportReception } from "./reception";

const ZEROS = { usd: 0, cdf: 0 };

const cafeteriaVide: AgregatCafeteria = {
  recetteNette: { usd: 120, cdf: 5600 },
  nombreVentes: 3,
  nombreComptes: 2,
  panierMoyen: { usd: 40, cdf: 1866.67 },
  parMode: [{ mode: "CASH", nombre: 3, parDevise: { usd: 120, cdf: 5600 } }],
  factureChambre: { nombre: 0, parDevise: { ...ZEROS } },
  parJour: [],
  topProduits: [{ nom: "Primus", categorie: "Boissons", quantite: 40, parDevise: { usd: 120, cdf: 0 } }],
  parCategorie: [{ categorie: "Boissons", quantite: 40, parDevise: { usd: 120, cdf: 0 } }],
  parServeur: [{ nom: "Jean", nombreVentes: 3, parDevise: { usd: 120, cdf: 5600 } }],
  inventaire: [],
  valeurStockCloture: { usd: 300, cdf: 0 },
  produitsSousSeuil: [{ produit: "Fanta", stock: 2, seuil: 5 }],
  pertesAjustements: [],
  annulations: [],
};

const receptionVide: AgregatReception = {
  recetteChambres: { usd: 1350, cdf: 0 },
  dontCafeteriaLiee: { usd: 15, cdf: 0 },
  nombreFactures: 2,
  nuitees: 60,
  tauxOccupationPourcent: 66.7,
  dureeMoyenneSejourNuits: 30,
  prixMoyenNuitee: { usd: 45, cdf: 0 },
  revenuParChambreDisponible: { usd: 30, cdf: 0 },
  factures: [],
  parMode: [{ mode: "CASH", nombre: 2, parDevise: { usd: 1350, cdf: 0 } }],
  monnaieRendueTotale: { usd: 5, cdf: 0 },
  occupationParChambre: [{ chambre: "Ch. 12", type: "Standard", nuitees: 30, revenu: { usd: 1350, cdf: 0 } }],
  occupationParType: [{ type: "Standard", nuitees: 60, revenu: { usd: 2700, cdf: 0 } }],
  demandesSite: { recues: 4, confirmees: 3, annulees: 1 },
  origineReservations: { reception: 5, sitePublic: 3 },
  annulationsReservations: [],
  annulationsRecus: [],
  sejoursEnCoursFinMois: [],
  acomptesEnCours: { ...ZEROS },
};

const ctx = (departement: "cafeteria" | "reception") =>
  ({
    numero: departement === "cafeteria" ? "RAP-CAF-202609-001" : "RAP-REC-202609-001",
    periode: "septembre 2026",
    plage: "du 01/09/2026 au 30/09/2026",
    genereParNom: "Jean Serveur",
    genereLe: new Date("2026-10-01T08:00:00Z"),
    provisoire: false,
    concordance: [],
    limites: [],
  }) as ContexteRapportCafeteria & ContexteRapportReception;

const branding = { nom: "Hôtel Chicago", adresse: "Av. du Test, Kasindi", telephone: "+243 000 000", couleur: "#1f4e2c" };

describe("Rendu PDF", () => {
  it("produit un vrai PDF pour la cafétaria (magic bytes + taille raisonnable)", async () => {
    const pdf = await rendreRapportCafeteria(cafeteriaVide, ctx("cafeteria"), branding, "abcd1234");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(3000);
  });

  it("produit un vrai PDF pour la réception", async () => {
    const pdf = await rendreRapportReception(receptionVide, ctx("reception"), branding, "abcd1234");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(3000);
  });

  it("le filigrane PROVISOIRE et les signatures ne font pas échouer le rendu", async () => {
    const pdf = await rendreRapportCafeteria(
      cafeteriaVide,
      { ...ctx("cafeteria"), provisoire: true },
      { ...branding, logo: null },
      "abcd1234"
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
