import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { StockService } from "./stock.service";

function creerPrismaMock() {
  return {
    produit: { findUnique: jest.fn(), updateMany: jest.fn() },
    mouvementStock: { findMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(mockSelf)),
  } as any;
}

let mockSelf: any;
const HOTEL_ID = "hotel-1";

describe("StockService", () => {
  let prisma: ReturnType<typeof creerPrismaMock>;
  let service: StockService;

  beforeEach(() => {
    prisma = creerPrismaMock();
    mockSelf = prisma;
    service = new StockService(prisma, { emettre: jest.fn() } as any, {} as any);
    prisma.mouvementStock.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "m1", ...data }));
    prisma.produit.updateMany.mockResolvedValue({ count: 1 });
  });

  it("lève NotFoundException si le produit n'existe pas", async () => {
    prisma.produit.findUnique.mockResolvedValue(null);
    await expect(
      service.enregistrerMouvement(prisma, {
        hotelId: HOTEL_ID,
        produitId: "inconnu",
        type: "ENTREE",
        quantite: 5,
        createdBy: "u1",
      })
    ).rejects.toThrow(NotFoundException);
  });

  it("une ENTREE augmente le stock", async () => {
    prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Coca", stockActuel: 10 });
    await service.enregistrerMouvement(prisma, {
      hotelId: HOTEL_ID,
      produitId: "p1",
      type: "ENTREE",
      quantite: 5,
      createdBy: "u1",
    });
    expect(prisma.produit.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", hotelId: HOTEL_ID, stockActuel: 10 },
      data: { stockActuel: 15, syncVersion: { increment: 1 } },
    });
  });

  it("relance une ConflictException si le stock a changé entre-temps (mise à jour concurrente)", async () => {
    prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Coca", stockActuel: 10 });
    prisma.produit.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.enregistrerMouvement(prisma, {
        hotelId: HOTEL_ID,
        produitId: "p1",
        type: "ENTREE",
        quantite: 5,
        createdBy: "u1",
      })
    ).rejects.toThrow(ConflictException);
    expect(prisma.mouvementStock.create).not.toHaveBeenCalled();
  });

  it("une SORTIE_VENTE diminue le stock", async () => {
    prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Coca", stockActuel: 10 });
    await service.enregistrerMouvement(prisma, {
      hotelId: HOTEL_ID,
      produitId: "p1",
      type: "SORTIE_VENTE",
      quantite: 3,
      createdBy: "u1",
    });
    expect(prisma.produit.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", hotelId: HOTEL_ID, stockActuel: 10 },
      data: { stockActuel: 7, syncVersion: { increment: 1 } },
    });
  });

  it("refuse une SORTIE_VENTE qui ferait passer le stock sous zéro", async () => {
    prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Coca", stockActuel: 2 });
    await expect(
      service.enregistrerMouvement(prisma, {
        hotelId: HOTEL_ID,
        produitId: "p1",
        type: "SORTIE_VENTE",
        quantite: 5,
        createdBy: "u1",
      })
    ).rejects.toThrow(ConflictException);
  });

  it("refuse une quantité négative ou nulle pour ENTREE/SORTIE_VENTE/PERTE", async () => {
    prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Coca", stockActuel: 10 });
    await expect(
      service.enregistrerMouvement(prisma, {
        hotelId: HOTEL_ID,
        produitId: "p1",
        type: "ENTREE",
        quantite: -1,
        createdBy: "u1",
      })
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.enregistrerMouvement(prisma, {
        hotelId: HOTEL_ID,
        produitId: "p1",
        type: "PERTE",
        quantite: 0,
        createdBy: "u1",
      })
    ).rejects.toThrow(BadRequestException);
  });

  it("un AJUSTEMENT applique directement le delta signé (positif ou négatif)", async () => {
    prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Coca", stockActuel: 10 });
    await service.enregistrerMouvement(prisma, {
      hotelId: HOTEL_ID,
      produitId: "p1",
      type: "AJUSTEMENT",
      quantite: -4,
      createdBy: "u1",
    });
    expect(prisma.produit.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", hotelId: HOTEL_ID, stockActuel: 10 },
      data: { stockActuel: 6, syncVersion: { increment: 1 } },
    });
  });

  it("refuse un AJUSTEMENT qui ferait passer le stock sous zéro", async () => {
    prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Coca", stockActuel: 3 });
    await expect(
      service.enregistrerMouvement(prisma, {
        hotelId: HOTEL_ID,
        produitId: "p1",
        type: "AJUSTEMENT",
        quantite: -10,
        createdBy: "u1",
      })
    ).rejects.toThrow(ConflictException);
  });
});
