import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { StockService } from "./stock.service";

function creerPrismaMock() {
  return {
    produit: { findUnique: jest.fn(), update: jest.fn() },
    mouvementStock: { findMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(mockSelf)),
  } as any;
}

let mockSelf: any;

describe("StockService", () => {
  let prisma: ReturnType<typeof creerPrismaMock>;
  let service: StockService;

  beforeEach(() => {
    prisma = creerPrismaMock();
    mockSelf = prisma;
    service = new StockService(prisma);
    prisma.mouvementStock.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "m1", ...data }));
    prisma.produit.update.mockResolvedValue({});
  });

  it("lève NotFoundException si le produit n'existe pas", async () => {
    prisma.produit.findUnique.mockResolvedValue(null);
    await expect(
      service.enregistrerMouvement(prisma, { produitId: "inconnu", type: "ENTREE", quantite: 5, createdBy: "u1" })
    ).rejects.toThrow(NotFoundException);
  });

  it("une ENTREE augmente le stock", async () => {
    prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Coca", stockActuel: 10 });
    await service.enregistrerMouvement(prisma, { produitId: "p1", type: "ENTREE", quantite: 5, createdBy: "u1" });
    expect(prisma.produit.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { stockActuel: 15, syncVersion: { increment: 1 } } });
  });

  it("une SORTIE_VENTE diminue le stock", async () => {
    prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Coca", stockActuel: 10 });
    await service.enregistrerMouvement(prisma, {
      produitId: "p1",
      type: "SORTIE_VENTE",
      quantite: 3,
      createdBy: "u1",
    });
    expect(prisma.produit.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { stockActuel: 7, syncVersion: { increment: 1 } } });
  });

  it("refuse une SORTIE_VENTE qui ferait passer le stock sous zéro", async () => {
    prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Coca", stockActuel: 2 });
    await expect(
      service.enregistrerMouvement(prisma, { produitId: "p1", type: "SORTIE_VENTE", quantite: 5, createdBy: "u1" })
    ).rejects.toThrow(ConflictException);
  });

  it("refuse une quantité négative ou nulle pour ENTREE/SORTIE_VENTE/PERTE", async () => {
    prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Coca", stockActuel: 10 });
    await expect(
      service.enregistrerMouvement(prisma, { produitId: "p1", type: "ENTREE", quantite: -1, createdBy: "u1" })
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.enregistrerMouvement(prisma, { produitId: "p1", type: "PERTE", quantite: 0, createdBy: "u1" })
    ).rejects.toThrow(BadRequestException);
  });

  it("un AJUSTEMENT applique directement le delta signé (positif ou négatif)", async () => {
    prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Coca", stockActuel: 10 });
    await service.enregistrerMouvement(prisma, { produitId: "p1", type: "AJUSTEMENT", quantite: -4, createdBy: "u1" });
    expect(prisma.produit.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { stockActuel: 6, syncVersion: { increment: 1 } } });
  });

  it("refuse un AJUSTEMENT qui ferait passer le stock sous zéro", async () => {
    prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Coca", stockActuel: 3 });
    await expect(
      service.enregistrerMouvement(prisma, { produitId: "p1", type: "AJUSTEMENT", quantite: -10, createdBy: "u1" })
    ).rejects.toThrow(ConflictException);
  });
});
