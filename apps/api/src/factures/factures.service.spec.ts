import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { FacturesService } from "./factures.service";

function creerPrismaMock() {
  return {
    reservation: { findUnique: jest.fn() },
    tauxChange: { findFirst: jest.fn() },
    venteCafeteria: { findMany: jest.fn() },
    facture: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  } as any;
}

const HOTEL_ID = "hotel-1";

describe("FacturesService", () => {
  let prisma: ReturnType<typeof creerPrismaMock>;
  let service: FacturesService;

  beforeEach(() => {
    prisma = creerPrismaMock();
    service = new FacturesService(prisma, { emettre: jest.fn() } as any);
    prisma.tauxChange.findFirst.mockResolvedValue(null);
    prisma.facture.findFirst.mockResolvedValue(null);
    prisma.venteCafeteria.findMany.mockResolvedValue([]);
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
      await expect(service.create({ reservationId: "r1", modePaiement: "CASH" } as any, HOTEL_ID)).rejects.toThrow(
        NotFoundException
      );
    });

    it("refuse de facturer une réservation qui n'a pas encore fait son check-in", async () => {
      prisma.reservation.findUnique.mockResolvedValue({ ...reservationEnCours, statut: "CONFIRMEE" });
      await expect(service.create({ reservationId: "r1", modePaiement: "CASH" } as any, HOTEL_ID)).rejects.toThrow(
        ConflictException
      );
    });

    it("refuse de créer une deuxième facture pour la même réservation", async () => {
      prisma.reservation.findUnique.mockResolvedValue({ ...reservationEnCours, facture: { id: "f-existante" } });
      await expect(service.create({ reservationId: "r1", modePaiement: "CASH" } as any, HOTEL_ID)).rejects.toThrow(
        ConflictException
      );
    });

    it("calcule montantChambre sur le nombre de nuits et déduit l'acompte du dû", async () => {
      prisma.reservation.findUnique.mockResolvedValue(reservationEnCours);
      prisma.facture.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      // 2 nuits à 45 $ = 90 $, moins 20 $ d'acompte = 70 $ dus, tout en USD.
      const facture = await service.create({ reservationId: "r1", modePaiement: "CASH" } as any, HOTEL_ID);

      expect(facture.montantChambre).toBe(90);
      expect(facture.deviseChambre).toBe("USD");
      expect(facture.montantTotalUSD).toBe(70);
      expect(facture.montantTotalCDF).toBe(0);
      expect(facture.numeroRecu).toMatch(/^REC-\d{8}-0001$/);
    });

    it("numérote au-delà du dernier numéro existant même s'il y a des trous (jamais un COUNT)", async () => {
      // Régression : un COUNT() de lignes suppose une séquence sans trou, ce qui
      // s'est révélé faux en pratique (voir DECISIONS.md / cafeteria.service.ts).
      // Une seule facture existe pour aujourd'hui, mais elle porte déjà le numéro 0007.
      const aaaammjj = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      prisma.reservation.findUnique.mockResolvedValue(reservationEnCours);
      prisma.facture.findFirst.mockResolvedValue({ numeroRecu: `REC-${aaaammjj}-0007` });
      prisma.facture.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const facture = await service.create({ reservationId: "r1", modePaiement: "CASH" } as any, HOTEL_ID);

      expect(facture.numeroRecu).toBe(`REC-${aaaammjj}-0008`);
    });

    it("ne dépasse jamais un dû négatif si l'acompte excède le montant du séjour", async () => {
      prisma.reservation.findUnique.mockResolvedValue({ ...reservationEnCours, acompte: 500 });
      prisma.facture.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const facture = await service.create({ reservationId: "r1", modePaiement: "CASH" } as any, HOTEL_ID);

      expect(facture.montantTotalUSD).toBe(0);
    });

    it("place le montant dans le bon panier de devise pour une chambre en CDF", async () => {
      prisma.reservation.findUnique.mockResolvedValue({
        ...reservationEnCours,
        acompte: 0,
        chambre: { prixParNuit: 20000, devise: "CDF" },
      });
      prisma.facture.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const facture = await service.create({ reservationId: "r1", modePaiement: "CASH" } as any, HOTEL_ID);

      expect(facture.montantTotalCDF).toBe(40000);
      expect(facture.montantTotalUSD).toBe(0);
    });

    it("ajoute les ventes cafétaria liées (FACTURE_CHAMBRE) au total de la même devise", async () => {
      prisma.reservation.findUnique.mockResolvedValue(reservationEnCours);
      prisma.venteCafeteria.findMany.mockResolvedValue([
        { montantTotalUSD: 12, montantTotalCDF: 0, annuleLe: null },
        { montantTotalUSD: 3, montantTotalCDF: 0, annuleLe: null },
      ]);
      prisma.facture.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      // 90 $ (2 nuits) - 20 $ acompte = 70 $ dus pour la chambre + 15 $ de cafétaria = 85 $.
      const facture = await service.create({ reservationId: "r1", modePaiement: "CASH" } as any, HOTEL_ID);

      expect(facture.montantTotalUSD).toBe(85);
      expect(facture.montantTotalCDF).toBe(0);
    });

    it("refuse un paiement croisé si le total mêle chambre et cafétaria dans des devises différentes", async () => {
      prisma.reservation.findUnique.mockResolvedValue(reservationEnCours); // chambre en USD
      prisma.venteCafeteria.findMany.mockResolvedValue([
        { montantTotalUSD: 0, montantTotalCDF: 15000, annuleLe: null },
      ]);

      await expect(
        service.create({
          reservationId: "r1",
          modePaiement: "CASH",
          deviseRegleeParClient: "USD",
          montantRegleParClient: 100,
          } as any,
          HOTEL_ID
        )
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("annuler", () => {
    it("refuse d'annuler une facture déjà annulée", async () => {
      prisma.facture.findUnique.mockResolvedValue({ id: "f1", annuleLe: new Date() });
      await expect(service.annuler("f1", { motif: "erreur" }, HOTEL_ID)).rejects.toThrow(ConflictException);
    });

    it("trace la date et le motif d'annulation sans supprimer la facture", async () => {
      prisma.facture.findUnique.mockResolvedValue({ id: "f1", annuleLe: null });
      prisma.facture.update.mockResolvedValue({ id: "f1", annuleLe: new Date() });

      await service.annuler("f1", { motif: "Erreur de saisie" }, HOTEL_ID);

      expect(prisma.facture.update).toHaveBeenCalledWith({
        where: { id: "f1", hotelId: HOTEL_ID },
        data: expect.objectContaining({ motifAnnulation: "Erreur de saisie" }),
      });
    });
  });
});
