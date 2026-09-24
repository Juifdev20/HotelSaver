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

const receptionniste = { userId: "u1", supabaseAuthId: "a1", role: Role.RECEPTIONNISTE, nom: "R" };
const patron = { userId: "u2", supabaseAuthId: "a2", role: Role.PATRON, nom: "P" };

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
      await expect(service.findOne("inconnue")).rejects.toThrow(NotFoundException);
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
        where: { id: "c1" },
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
      await expect(service.remove("c1")).rejects.toThrow(ConflictException);
    });
  });
});
