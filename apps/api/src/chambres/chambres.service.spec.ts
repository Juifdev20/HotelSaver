import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@hotel-chicago/database";
import { Role } from "@hotel-chicago/types";
import { ChambresService } from "./chambres.service";

function creerPrismaMock() {
  return {
    chambre: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
}

const HOTEL_ID = "hotel-1";
const receptionniste = { userId: "u1", supabaseAuthId: "a1", role: Role.RECEPTIONNISTE, nom: "R", hotelId: HOTEL_ID };
const patron = { userId: "u2", supabaseAuthId: "a2", role: Role.PATRON, nom: "P", hotelId: HOTEL_ID };

describe("ChambresService", () => {
  let prisma: ReturnType<typeof creerPrismaMock>;
  let service: ChambresService;

  beforeEach(() => {
    prisma = creerPrismaMock();
    service = new ChambresService(prisma);
  });

  describe("findOne", () => {
    it("lève NotFoundException si la chambre n'existe pas", async () => {
      prisma.chambre.findUnique.mockResolvedValue(null);
      await expect(service.findOne("inconnue", HOTEL_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe("update — restriction de champs pour RECEPTIONNISTE", () => {
    beforeEach(() => {
      prisma.chambre.findUnique.mockResolvedValue({ id: "c1", numero: "101" });
    });

    it("autorise un RECEPTIONNISTE à changer uniquement le statut", async () => {
      prisma.chambre.update.mockResolvedValue({ id: "c1", statut: "OCCUPEE" });
      await service.update("c1", { statut: "OCCUPEE" } as any, receptionniste);
      expect(prisma.chambre.update).toHaveBeenCalledWith({
        where: { id: "c1", hotelId: HOTEL_ID },
        data: { statut: "OCCUPEE", syncVersion: { increment: 1 } },
      });
    });

    it("refuse un RECEPTIONNISTE qui tente de changer le prix", async () => {
      await expect(
        service.update("c1", { prixParNuit: 999 } as any, receptionniste)
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.chambre.update).not.toHaveBeenCalled();
    });

    it("refuse un RECEPTIONNISTE qui tente de changer le type ou la devise", async () => {
      await expect(
        service.update("c1", { type: "Suite" } as any, receptionniste)
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update("c1", { devise: "CDF" } as any, receptionniste)
      ).rejects.toThrow(ForbiddenException);
    });

    it("autorise un PATRON à changer le prix", async () => {
      prisma.chambre.update.mockResolvedValue({ id: "c1", prixParNuit: 60 });
      await service.update("c1", { prixParNuit: 60 } as any, patron);
      expect(prisma.chambre.update).toHaveBeenCalled();
    });
  });

  describe("update — séparation des tâches : le STATUT est un geste de réception", () => {
    beforeEach(() => {
      prisma.chambre.findUnique.mockResolvedValue({ id: "c1", numero: "101" });
      prisma.chambre.update.mockResolvedValue({ id: "c1" });
    });

    it("refuse au patron de changer le statut d'une chambre par défaut", async () => {
      await expect(service.update("c1", { statut: "LIBRE" } as any, patron)).rejects.toThrow(ForbiddenException);
      expect(prisma.chambre.update).not.toHaveBeenCalled();
    });

    it("l'autorise quand l'hôtel a activé « le patron peut aussi opérer »", async () => {
      await service.update("c1", { statut: "LIBRE" } as any, { ...patron, patronPeutOperer: true });
      expect(prisma.chambre.update).toHaveBeenCalled();
    });

    it("le patron garde l'administration : prix et type restent modifiables sans le réglage", async () => {
      await service.update("c1", { prixParNuit: 80, type: "Suite" } as any, patron);
      expect(prisma.chambre.update).toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    beforeEach(() => {
      prisma.chambre.findUnique.mockResolvedValue({ id: "c1" });
    });

    it("convertit une violation de contrainte de clé étrangère en message clair", async () => {
      prisma.chambre.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("FK violation", {
          code: "P2003",
          clientVersion: "5.22.0",
        })
      );
      await expect(service.remove("c1", HOTEL_ID)).rejects.toThrow(ConflictException);
    });
  });
});
