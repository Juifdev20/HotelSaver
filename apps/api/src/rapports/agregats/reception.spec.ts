import { PrismaClient } from "@hotel-chicago/database";
import { agregatReception } from "./reception";
import { bornesDuMois } from "./bornes";

const HOTEL = "hotel-1";

function prismaMock(over: Partial<Record<string, unknown>> = {}) {
  return {
    facture: { findMany: jest.fn().mockResolvedValue([]) },
    chambre: { findMany: jest.fn().mockResolvedValue([]) },
    reservation: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    ...over,
  } as unknown as PrismaClient & { [k: string]: { findMany: jest.Mock } };
}

const MOIS = bornesDuMois("2026-09", new Date("2026-10-05T00:00:00Z"));

const facture = (over: Record<string, unknown> = {}) => ({
  montantChambre: 90,
  deviseChambre: "USD",
  montantTotalUSD: 105,
  montantTotalCDF: 0,
  modePaiement: "CASH",
  numeroRecu: "REC-001",
  montantMonnaieRendue: null,
  deviseMonnaieRendue: null,
  createdAt: new Date("2026-09-05T10:00:00Z"),
  reservation: {
    dateArrivee: new Date("2026-09-01T22:00:00Z"),
    dateDepart: new Date("2026-09-03T22:00:00Z"),
    client: { nom: "Juif" },
    chambre: { numero: "12", type: "Standard", devise: "USD", prixParNuit: 45 },
    ...((over.reservation as object) ?? {}),
  },
  ...over,
});

describe("agregatReception", () => {
  it("sépare la recette chambre de la cafétaria facturée en chambre (pas de double comptage)", async () => {
    const prisma = prismaMock({
      facture: { findMany: jest.fn().mockResolvedValue([facture()]) },
    });
    const a = await agregatReception(prisma, HOTEL, MOIS);
    expect(a.recetteChambres).toEqual({ usd: 90, cdf: 0 });
    // 105 total − 90 chambre = 15 $ de cafétaria déjà dans la facture.
    expect(a.dontCafeteriaLiee).toEqual({ usd: 15, cdf: 0 });
    expect(a.nombreFactures).toBe(1);
  });

  it("les reçus annulés ne comptent pas dans la recette", async () => {
    const prisma = prismaMock();
    await agregatReception(prisma, HOTEL, MOIS);
    expect(prisma.facture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ annuleLe: null }),
      })
    );
  });

  it("calcule les nuitées en recouvrement de mois (séjour à cheval)", async () => {
    const prisma = prismaMock({
      chambre: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "ch1", numero: "12", type: "Standard", devise: "USD", prixParNuit: 45 }]),
      },
      reservation: {
        findMany: jest
          .fn()
          // Appel « séjours actifs » : arrivée 29/09, départ 06/10 (heure de
          // Lubumbashi) → seules 2 nuitées tombent dans septembre (29→30 et 30→1/10).
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              chambreId: "ch1",
              dateArrivee: new Date("2026-09-28T22:00:00Z"), // 29/09 00:00 à Lubumbashi
              dateDepart: new Date("2026-10-05T22:00:00Z"), // 06/10 00:00
              origine: "RECEPTION",
              statut: "EN_COURS",
              acompte: 0,
              chambre: { id: "ch1", numero: "12", type: "Standard", devise: "USD", prixParNuit: 45 },
              client: { nom: "A" },
            },
          ]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    });
    const a = await agregatReception(prisma, HOTEL, MOIS);
    expect(a.nuitees).toBe(2);
    // Une seule chambre dans l'hôtel → 2 nuitées / 30 jours de capacité.
    expect(a.tauxOccupationPourcent).toBe(6.7);
  });

  it("totaux par mode de paiement et détail des factures", async () => {
    const prisma = prismaMock({
      facture: {
        findMany: jest.fn().mockResolvedValue([
          facture(),
          facture({ numeroRecu: "REC-002", modePaiement: "MOBILE_MONEY", montantTotalUSD: 90, montantTotalCDF: 0, montantChambre: 90 }),
        ]),
      },
    });
    const a = await agregatReception(prisma, HOTEL, MOIS);
    expect(a.parMode).toHaveLength(2);
    expect(a.factures.map((f) => f.numeroRecu)).toEqual(["REC-001", "REC-002"]);
  });
});
