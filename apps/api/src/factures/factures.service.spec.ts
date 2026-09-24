import { ConflictException, NotFoundException } from "@nestjs/common";
import { FacturesService } from "./factures.service";

function creerPrismaMock() {
  return {
    reservation: { findUnique: jest.fn() },
    tauxChange: { findFirst: jest.fn() },
    facture: { create: jest.fn(), count: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  } as any;
}

describe("FacturesService", () => {
  let prisma: ReturnType<typeof creerPrismaMock>;
  let service: FacturesService;

  beforeEach(() => {
    prisma = creerPrismaMock();
    service = new FacturesService(prisma);
    prisma.tauxChange.findFirst.mockResolvedValue(null);
    prisma.facture.count.mockResolvedValue(0);
  });

  describe("create", () => {
    const reservationEnCours = {
      id: "r1",
      statut: "EN_COURS",
      acompte: 20,
      dateArrivee: new Date("2026-10-01T00:00:00.000Z"),
      dateDepart: new Date("2026-10-03T00:00:00.000Z"),
      chambre: { prixParNuit: 45, devise: "USD" },
      facture: null,
    };

    it("lève NotFoundException si la réservation n'existe pas", async () => {
      prisma.reservation.findUnique.mockResolvedValue(null);
      await expect(service.create({ reservationId: "r1", modePaiement: "CASH" } as any)).rejects.toThrow(
        NotFoundException
      );
    });

    it("refuse de facturer une réservation qui n'a pas encore fait son check-in", async () => {
      prisma.reservation.findUnique.mockResolvedValue({ ...reservationEnCours, statut: "CONFIRMEE" });
      await expect(service.create({ reservationId: "r1", modePaiement: "CASH" } as any)).rejects.toThrow(
        ConflictException
      );
    });

    it("refuse de créer une deuxième facture pour la même réservation", async () => {
      prisma.reservation.findUnique.mockResolvedValue({ ...reservationEnCours, facture: { id: "f-existante" } });
      await expect(service.create({ reservationId: "r1", modePaiement: "CASH" } as any)).rejects.toThrow(
        ConflictException
      );
    });

    it("calcule montantChambre sur le nombre de nuits et déduit l'acompte du dû", async () => {
      prisma.reservation.findUnique.mockResolvedValue(reservationEnCours);
      prisma.facture.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      // 2 nuits à 45 $ = 90 $, moins 20 $ d'acompte = 70 $ dus, tout en USD.
      const facture = await service.create({ reservationId: "r1", modePaiement: "CASH" } as any);

      expect(facture.montantChambre).toBe(90);
      expect(facture.deviseChambre).toBe("USD");
      expect(facture.montantTotalUSD).toBe(70);
      expect(facture.montantTotalCDF).toBe(0);
      expect(facture.numeroRecu).toMatch(/^REC-\d{8}-0001$/);
    });

    it("ne dépasse jamais un dû négatif si l'acompte excède le montant du séjour", async () => {
      prisma.reservation.findUnique.mockResolvedValue({ ...reservationEnCours, acompte: 500 });
      prisma.facture.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const facture = await service.create({ reservationId: "r1", modePaiement: "CASH" } as any);

      expect(facture.montantTotalUSD).toBe(0);
    });

    it("place le montant dans le bon panier de devise pour une chambre en CDF", async () => {
      prisma.reservation.findUnique.mockResolvedValue({
        ...reservationEnCours,
        acompte: 0,
        chambre: { prixParNuit: 20000, devise: "CDF" },
      });
      prisma.facture.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const facture = await service.create({ reservationId: "r1", modePaiement: "CASH" } as any);

      expect(facture.montantTotalCDF).toBe(40000);
      expect(facture.montantTotalUSD).toBe(0);
    });
  });

  describe("annuler", () => {
    it("refuse d'annuler une facture déjà annulée", async () => {
      prisma.facture.findUnique.mockResolvedValue({ id: "f1", annuleLe: new Date() });
      await expect(service.annuler("f1", { motif: "erreur" })).rejects.toThrow(ConflictException);
    });

    it("trace la date et le motif d'annulation sans supprimer la facture", async () => {
      prisma.facture.findUnique.mockResolvedValue({ id: "f1", annuleLe: null });
      prisma.facture.update.mockResolvedValue({ id: "f1", annuleLe: new Date() });

      await service.annuler("f1", { motif: "Erreur de saisie" });

      expect(prisma.facture.update).toHaveBeenCalledWith({
        where: { id: "f1" },
        data: expect.objectContaining({ motifAnnulation: "Erreur de saisie" }),
      });
    });
  });
});
