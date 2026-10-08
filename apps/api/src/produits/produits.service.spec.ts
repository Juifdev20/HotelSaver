import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@hotel-chicago/database";
import { ProduitsService } from "./produits.service";

function creerPrismaMock() {
  return {
    produit: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
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

  describe("code-barres", () => {
    const doublon = () => new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "7" });

    it("retire les espaces du code avant enregistrement", async () => {
      prisma.produit.create.mockImplementation(({ data }: any) => Promise.resolve(data));
      const produit = await service.create(
        { nom: "Fanta", categorie: "Boissons", prix: 1, devise: "USD", codeBarres: " 600 1234 567890 " } as any,
        HOTEL_ID
      );
      expect(produit.codeBarres).toBe("6001234567890");
    });

    it("code déjà pris : 409 qui nomme le produit concerné", async () => {
      prisma.produit.create.mockRejectedValue(doublon());
      prisma.produit.findFirst.mockResolvedValue({ nom: "Fanta 33 cl" });
      await expect(
        service.create({ nom: "Coca", categorie: "Boissons", prix: 1, devise: "USD", codeBarres: "6001234567890" } as any, HOTEL_ID)
      ).rejects.toThrow(/déjà utilisé par « Fanta 33 cl »/);
    });

    it("un plat préparé n'accepte pas de code-barres", async () => {
      await expect(
        service.create({ nom: "Riz", categorie: "Plats", prix: 5, devise: "USD", typeProduit: "PLAT", codeBarres: "2000000000008" } as any, HOTEL_ID)
      ).rejects.toThrow(BadRequestException);
    });

    it("un article qui devient plat perd son code", async () => {
      prisma.produit.findUnique.mockResolvedValue({ id: "p1", typeProduit: "ARTICLE", codeBarres: "2000000000008" });
      prisma.produit.update.mockImplementation(({ data }: any) => Promise.resolve(data));
      const produit = await service.update("p1", { typeProduit: "PLAT" } as any, HOTEL_ID);
      expect(produit.codeBarres).toBeNull();
    });

    it("associerCodeBarres (cafétaria) ne touche que le code et incrémente syncVersion", async () => {
      prisma.produit.findUnique.mockResolvedValue({ id: "p1", typeProduit: "ARTICLE", codeBarres: null });
      prisma.produit.update.mockResolvedValue({});
      await service.associerCodeBarres("p1", "6001234567890", HOTEL_ID);
      expect(prisma.produit.update).toHaveBeenCalledWith({
        where: { id: "p1", hotelId: HOTEL_ID },
        data: { codeBarres: "6001234567890", syncVersion: { increment: 1 } },
      });
    });
  });
});
