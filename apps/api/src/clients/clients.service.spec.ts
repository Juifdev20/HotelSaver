import { NotFoundException } from "@nestjs/common";
import { ClientsService } from "./clients.service";

const HOTEL_ID = "hotel-1";

describe("ClientsService", () => {
  let prisma: { client: { findMany: jest.Mock; findUnique: jest.Mock } };
  let service: ClientsService;

  beforeEach(() => {
    prisma = { client: { findMany: jest.fn(), findUnique: jest.fn() } };
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
});
