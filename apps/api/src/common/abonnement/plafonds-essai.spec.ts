import { plafondsEssaiDe } from "./plafonds-essai";
import { invaliderCatalogue } from "./catalogue";

/** Plafonds de l'essai gratuit (18/10/2026) : seulement pour un hôtel qui n'a jamais payé. */
describe("plafondsEssaiDe", () => {
  const prisma = (hotel: unknown) =>
    ({
      hotel: { findUnique: jest.fn().mockResolvedValue(hotel) },
      // Réglages absents → valeurs de départ (10 chambres, 50 produits, 6 photos).
      formuleAbonnement: { findMany: jest.fn().mockResolvedValue([]) },
      parametresPlateforme: { findUnique: jest.fn().mockResolvedValue(null) },
    }) as any;

  beforeEach(() => invaliderCatalogue());

  it("hôtel en essai, jamais payé : plafonds de l'essai", async () => {
    const p = await plafondsEssaiDe(prisma({ formule: null, statutLicence: "ESSAI", _count: { paiementsLicence: 0 } }), "h1");
    expect(p).toEqual({ chambres: 10, produits: 50, photosGalerie: 6 });
  });

  it("hôtel avec formule, paiement, ou activé à la main (ACTIF) : aucun plafond d'essai", async () => {
    expect(await plafondsEssaiDe(prisma({ formule: "PRO", statutLicence: "ESSAI", _count: { paiementsLicence: 0 } }), "h1")).toBeNull();
    expect(await plafondsEssaiDe(prisma({ formule: null, statutLicence: "SUSPENDU", _count: { paiementsLicence: 1 } }), "h1")).toBeNull();
    expect(await plafondsEssaiDe(prisma({ formule: null, statutLicence: "ACTIF", _count: { paiementsLicence: 0 } }), "h1")).toBeNull();
    expect(await plafondsEssaiDe(prisma(null), "h1")).toBeNull();
  });
});
