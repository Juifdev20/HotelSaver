import { NotFoundException } from "@nestjs/common";
import { ClientsService } from "./clients.service";

const HOTEL_ID = "hotel-1";

describe("ClientsService", () => {
  let prisma: { client: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock } };
  let service: ClientsService;

  beforeEach(() => {
    prisma = { client: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() } };
    service = new ClientsService(prisma as any);
  });

  describe("findAll", () => {
    it("liste les clients de l'hôtel par ordre alphabétique avec leurs réservations", async () => {
      prisma.client.findMany.mockResolvedValue([{ id: "c1" }]);
      await service.findAll(HOTEL_ID);
      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hotelId: HOTEL_ID },
          orderBy: { nom: "asc" },
        })
      );
    });

    it("filtre par nom ou téléphone (insensible à la casse) quand q est fourni", async () => {
      prisma.client.findMany.mockResolvedValue([]);
      await service.findAll(HOTEL_ID, " jean ");
      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            hotelId: HOTEL_ID,
            OR: [
              { nom: { contains: "jean", mode: "insensitive" } },
              { telephone: { contains: "jean" } },
            ],
          },
        })
      );
    });
  });

  describe("findOne", () => {
    it("lève NotFoundException pour un client inexistant ou d'un autre hôtel", async () => {
      prisma.client.findUnique.mockResolvedValue(null);
      await expect(service.findOne("c1", HOTEL_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe("update", () => {
    it("complète la fiche (pièce d'identité, notes) en incrémentant syncVersion", async () => {
      prisma.client.findUnique.mockResolvedValue({ id: "c1" });
      prisma.client.update.mockResolvedValue({ id: "c1" });
      await service.update("c1", { typePiece: "PASSEPORT", numeroPiece: "AB123", notes: "VIP" }, HOTEL_ID);
      expect(prisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "c1", hotelId: HOTEL_ID },
          data: { typePiece: "PASSEPORT", numeroPiece: "AB123", notes: "VIP", syncVersion: { increment: 1 } },
        })
      );
    });

    it("lève NotFoundException pour un client d'un autre hôtel", async () => {
      prisma.client.findUnique.mockResolvedValue(null);
      await expect(service.update("cX", { nom: "X" }, HOTEL_ID)).rejects.toThrow(NotFoundException);
      expect(prisma.client.update).not.toHaveBeenCalled();
    });
  });
});
