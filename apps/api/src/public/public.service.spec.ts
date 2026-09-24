import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PublicService } from "./public.service";

function creerPrismaMock() {
  return {
    chambre: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    reservation: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    produit: { findMany: jest.fn().mockResolvedValue([]) },
    client: { findFirst: jest.fn(), create: jest.fn() },
  } as any;
}

describe("PublicService", () => {
  let prisma: ReturnType<typeof creerPrismaMock>;
  let service: PublicService;

  beforeEach(() => {
    prisma = creerPrismaMock();
    service = new PublicService(prisma);
  });

  describe("findChambresDisponibles", () => {
    it("sans dates, retourne les chambres LIBRE uniquement", async () => {
      await service.findChambresDisponibles({});
      expect(prisma.chambre.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { statut: "LIBRE" } })
      );
    });

    it("avec des dates, exclut les chambres ayant une réservation active qui chevauche", async () => {
      prisma.reservation.findMany.mockResolvedValue([{ chambreId: "c1" }]);
      await service.findChambresDisponibles({ dateArrivee: "2026-10-01", dateDepart: "2026-10-03" });
      expect(prisma.chambre.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { notIn: ["c1"] } } })
      );
    });

    it("refuse une plage de dates invalide", async () => {
      await expect(
        service.findChambresDisponibles({ dateArrivee: "2026-10-05", dateDepart: "2026-10-01" })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("creerDemandeReservation", () => {
    const dto = {
      chambreId: "c1",
      client: { nom: "Jean Visiteur", telephone: "+243900000000" },
      dateArrivee: "2026-10-01T00:00:00.000Z",
      dateDepart: "2026-10-03T00:00:00.000Z",
    };

    it("lève NotFoundException si la chambre n'existe pas", async () => {
      prisma.chambre.findUnique.mockResolvedValue(null);
      await expect(service.creerDemandeReservation(dto as any)).rejects.toThrow(NotFoundException);
    });

    it("réutilise un client existant trouvé par téléphone plutôt que d'en créer un nouveau", async () => {
      prisma.chambre.findUnique.mockResolvedValue({ id: "c1" });
      prisma.client.findFirst.mockResolvedValue({ id: "client-existant" });
      prisma.reservation.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const resa = await service.creerDemandeReservation(dto as any);

      expect(prisma.client.create).not.toHaveBeenCalled();
      expect(resa.clientId).toBe("client-existant");
    });

    it("crée toujours la réservation en EN_ATTENTE / SITE_PUBLIC, jamais confirmée", async () => {
      prisma.chambre.findUnique.mockResolvedValue({ id: "c1" });
      prisma.client.findFirst.mockResolvedValue(null);
      prisma.client.create.mockResolvedValue({ id: "nouveau-client" });
      prisma.reservation.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const resa = await service.creerDemandeReservation(dto as any);

      expect(resa.statut).toBe("EN_ATTENTE");
      expect(resa.origine).toBe("SITE_PUBLIC");
      expect(resa.createdBy).toBe("SITE_PUBLIC");
    });
  });
});
