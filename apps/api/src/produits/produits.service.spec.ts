import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@hotel-chicago/database";
import { ProduitsService } from "./produits.service";

function creerPrismaMock() {
  return {
    produit: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  } as any;
}

const HOTEL_ID = "hotel-1";

describe("ProduitsService", () => {
  let prisma: ReturnType<typeof creerPrismaMock>;
  let service: ProduitsService;

  beforeEach(() => {
    prisma = creerPrismaMock();
    service = new ProduitsService(prisma);
  });

  it("lève NotFoundException si le produit n'existe pas", async () => {
    prisma.produit.findUnique.mockResolvedValue(null);
    await expect(service.findOne("inconnu", HOTEL_ID)).rejects.toThrow(NotFoundException);
  });

  it("initialise stockActuel à 0 si non fourni à la création", async () => {
    prisma.produit.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const produit = await service.create(
      { nom: "Coca-Cola", categorie: "Boissons", prix: 1.5, devise: "USD" } as any,
      HOTEL_ID
    );
    expect(produit.stockActuel).toBe(0);
  });

  it("respecte un stock initial explicite à la création", async () => {
    prisma.produit.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const produit = await service.create(
      {
        nom: "Coca-Cola",
        categorie: "Boissons",
        prix: 1.5,
        devise: "USD",
        stockActuel: 24,
      } as any,
      HOTEL_ID
    );
    expect(produit.stockActuel).toBe(24);
  });

  it("convertit une violation de contrainte de clé étrangère en message clair à la suppression", async () => {
    prisma.produit.findUnique.mockResolvedValue({ id: "p1" });
    prisma.produit.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("FK violation", { code: "P2003", clientVersion: "5.22.0" })
    );
    await expect(service.remove("p1", HOTEL_ID)).rejects.toThrow(ConflictException);
  });
});
