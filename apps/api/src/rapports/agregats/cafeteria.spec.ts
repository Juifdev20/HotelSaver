import { PrismaClient } from "@hotel-chicago/database";
import { agregatCafeteria, signeMouvement } from "./cafeteria";
import { bornesDuMois } from "./bornes";

const HOTEL = "hotel-1";

function prismaMock(over: Partial<Record<string, unknown>> = {}) {
  return {
    venteCafeteria: { findMany: jest.fn().mockResolvedValue([]) },
    ligneCommande: { findMany: jest.fn().mockResolvedValue([]) },
    utilisateur: { findMany: jest.fn().mockResolvedValue([]) },
    produit: { findMany: jest.fn().mockResolvedValue([]) },
    mouvementStock: { findMany: jest.fn().mockResolvedValue([]) },
    ...over,
  } as unknown as PrismaClient & { [k: string]: { findMany: jest.Mock } };
}

const MOIS = bornesDuMois("2026-09", new Date("2026-10-05T00:00:00Z"));

describe("agregatCafeteria", () => {
  it("additionne les ventes non annulées du mois par devise, sans fusionner", async () => {
    const prisma = prismaMock({
      venteCafeteria: {
        findMany: jest.fn().mockResolvedValue([
          { montantTotalUSD: 10, montantTotalCDF: 0, modePaiement: "CASH", compteId: "c1", sousCompteId: null, createdBy: "u1", createdAt: new Date("2026-09-10T12:00:00Z"), reservationLieeId: null },
          { montantTotalUSD: 0, montantTotalCDF: 8400, modePaiement: "MOBILE_MONEY", compteId: "c2", sousCompteId: null, createdBy: "u1", createdAt: new Date("2026-09-12T12:00:00Z"), reservationLieeId: null },
        ]),
      },
    });
    const a = await agregatCafeteria(prisma, HOTEL, MOIS);
    expect(a.recetteNette).toEqual({ usd: 10, cdf: 8400 });
    expect(a.nombreVentes).toBe(2);
    expect(a.nombreComptes).toBe(2);
    expect(a.panierMoyen).toEqual({ usd: 5, cdf: 4200 });
    expect(a.parMode.map((m) => m.mode).sort()).toEqual(["CASH", "MOBILE_MONEY"]);
  });

  it("ignore les ventes annulées ET les ventes hors mois (bornes Lubumbashi)", async () => {
    const prisma = prismaMock();
    await agregatCafeteria(prisma, HOTEL, MOIS);
    expect(prisma.venteCafeteria.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hotelId: HOTEL,
          annuleLe: null,
          createdAt: { gte: new Date("2026-08-31T22:00:00Z"), lt: new Date("2026-09-30T22:00:00Z") },
        }),
      })
    );
  });

  it("isole les ventes FACTURE_CHAMBRE pour éviter le double comptage avec les factures", async () => {
    const prisma = prismaMock({
      venteCafeteria: {
        findMany: jest.fn().mockResolvedValue([
          { montantTotalUSD: 15, montantTotalCDF: 0, modePaiement: "FACTURE_CHAMBRE", compteId: "c1", sousCompteId: null, createdBy: "u1", createdAt: new Date("2026-09-10T12:00:00Z"), reservationLieeId: "r1" },
          { montantTotalUSD: 20, montantTotalCDF: 0, modePaiement: "CASH", compteId: "c2", sousCompteId: null, createdBy: "u1", createdAt: new Date("2026-09-10T12:00:00Z"), reservationLieeId: null },
        ]),
      },
    });
    const a = await agregatCafeteria(prisma, HOTEL, MOIS);
    // Le total cafétaria inclut les ventes facturées en chambre...
    expect(a.recetteNette.usd).toBe(35);
    // ...mais elles sont listées à part pour ne pas être additionnées deux fois.
    expect(a.factureChambre).toEqual({ nombre: 1, parDevise: { usd: 15, cdf: 0 } });
  });

  it("reconstitue le stock : ouverture + mouvements du mois = clôture", async () => {
    const prisma = prismaMock({
      produit: {
        findMany: jest.fn().mockResolvedValue([
          { id: "p1", nom: "Primus", categorie: "Boissons", prix: 3, devise: "USD", stockActuel: 40, seuilAlerte: 5, actif: true },
        ]),
      },
      mouvementStock: {
        findMany: jest.fn().mockResolvedValue([
          // Dans le mois : +30 entrée, −18 ventes, −2 perte → clôture 40 ⇒ ouverture 30.
          { produitId: "p1", quantite: 30, type: "ENTREE", motif: null, createdAt: new Date("2026-09-05T10:00:00Z") },
          { produitId: "p1", quantite: 18, type: "SORTIE_VENTE", motif: null, createdAt: new Date("2026-09-10T10:00:00Z") },
          { produitId: "p1", quantite: 2, type: "PERTE", motif: "cassé", createdAt: new Date("2026-09-15T10:00:00Z") },
          // Après le mois : ne change pas le stock d'ouverture.
          { produitId: "p1", quantite: 5, type: "ENTREE", motif: null, createdAt: new Date("2026-10-02T10:00:00Z") },
        ]),
      },
    });
    const a = await agregatCafeteria(prisma, HOTEL, MOIS);
    const ligne = a.inventaire.find((l) => l.produit === "Primus")!;
    // clôture = stockActuel(40) − mouvements après fin(+5) = 35 ; ouverture = 35 − (+30−18−2) = 25
    expect(ligne.stockCloture).toBe(35);
    expect(ligne.entrees).toBe(30);
    expect(ligne.sortiesVentes).toBe(18);
    expect(ligne.pertes).toBe(2);
    expect(ligne.stockOuverture).toBe(25);
    expect(ligne.stockOuverture + ligne.entrees - ligne.sortiesVentes - ligne.pertes + ligne.ajustements).toBe(ligne.stockCloture);
    expect(ligne.valeurCloture).toEqual({ usd: 105, cdf: 0 });
    // La perte est listée avec son motif.
    expect(a.pertesAjustements).toEqual([
      expect.objectContaining({ produit: "Primus", type: "PERTE", quantite: 2, motif: "cassé" }),
    ]);
  });

  it("signeMouvement : ENTREE +, AJUSTEMENT signé par la quantité, SORTIE_VENTE/PERTE −", () => {
    expect(signeMouvement("ENTREE")).toBe(1);
    expect(signeMouvement("AJUSTEMENT")).toBe(1);
    expect(signeMouvement("SORTIE_VENTE")).toBe(-1);
    expect(signeMouvement("PERTE")).toBe(-1);
  });
});
