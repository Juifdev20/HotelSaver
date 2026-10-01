import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";
import { ReservationsService } from "./reservations.service";

function creerPrismaMock() {
  return {
    reservation: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    chambre: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    client: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as any;
}

const HOTEL_ID = "hotel-1";
const currentUser = { userId: "u1", supabaseAuthId: "a1", role: Role.RECEPTIONNISTE, nom: "R", hotelId: HOTEL_ID };

describe("ReservationsService", () => {
  let prisma: ReturnType<typeof creerPrismaMock>;
  let service: ReservationsService;

  beforeEach(() => {
    prisma = creerPrismaMock();
    service = new ReservationsService(prisma, { emettre: jest.fn() } as any);
    prisma.chambre.findUnique.mockResolvedValue({ id: "c1", devise: "USD", prixParNuit: 45 });
    prisma.reservation.findFirst.mockResolvedValue(null); // pas de conflit par défaut
  });

  describe("create", () => {
    const base = {
      chambreId: "c1",
      dateArrivee: "2026-10-01T00:00:00.000Z",
      dateDepart: "2026-10-03T00:00:00.000Z",
    };

    it("refuse si ni clientId ni client ne sont fournis", async () => {
      await expect(service.create({ ...base } as any, currentUser)).rejects.toThrow(BadRequestException);
    });

    it("refuse si clientId ET client sont fournis en même temps", async () => {
      await expect(
        service.create({ ...base, clientId: "cl1", client: { nom: "X" } } as any, currentUser)
      ).rejects.toThrow(BadRequestException);
    });

    it("refuse si la date de départ précède la date d'arrivée", async () => {
      await expect(
        service.create(
          { ...base, clientId: "cl1", dateArrivee: "2026-10-05", dateDepart: "2026-10-01" } as any,
          currentUser
        )
      ).rejects.toThrow(BadRequestException);
    });

    it("lève NotFoundException si la chambre n'existe pas", async () => {
      prisma.chambre.findUnique.mockResolvedValue(null);
      await expect(service.create({ ...base, clientId: "cl1" } as any, currentUser)).rejects.toThrow(
        NotFoundException
      );
    });

    it("refuse si la chambre est déjà réservée sur une période chevauchante", async () => {
      prisma.client.findUnique.mockResolvedValue({ id: "cl1" });
      prisma.reservation.findFirst.mockResolvedValue({ id: "existante" });
      await expect(service.create({ ...base, clientId: "cl1" } as any, currentUser)).rejects.toThrow(
        ConflictException
      );
    });

    it("crée la réservation avec statut CONFIRMEE et origine RECEPTION", async () => {
      prisma.client.findUnique.mockResolvedValue({ id: "cl1" });
      prisma.reservation.create.mockResolvedValue({ id: "r1" });

      await service.create({ ...base, clientId: "cl1" } as any, currentUser);

      expect(prisma.reservation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statut: "CONFIRMEE",
            origine: "RECEPTION",
            createdBy: "u1",
            clientId: "cl1",
          }),
        })
      );
    });

    it("crée un nouveau client quand `client` est fourni au lieu de `clientId`", async () => {
      prisma.client.create.mockResolvedValue({ id: "cl-nouveau" });
      prisma.reservation.create.mockResolvedValue({ id: "r1" });

      await service.create({ ...base, client: { nom: "Jean" } } as any, currentUser);

      expect(prisma.client.create).toHaveBeenCalledWith({ data: { nom: "Jean", hotelId: HOTEL_ID } });
      expect(prisma.reservation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ clientId: "cl-nouveau" }) })
      );
    });
  });

  describe("annuler", () => {
    it("refuse d'annuler une réservation déjà annulée", async () => {
      prisma.reservation.findUnique.mockResolvedValue({ id: "r1", statut: "ANNULEE" });
      await expect(service.annuler("r1", { motif: "test" }, HOTEL_ID)).rejects.toThrow(ConflictException);
    });

    it("refuse d'annuler une réservation déjà terminée", async () => {
      prisma.reservation.findUnique.mockResolvedValue({ id: "r1", statut: "TERMINEE" });
      await expect(service.annuler("r1", { motif: "test" }, HOTEL_ID)).rejects.toThrow(ConflictException);
    });

    it("annule et trace le motif pour une réservation CONFIRMEE", async () => {
      prisma.reservation.findUnique.mockResolvedValue({ id: "r1", statut: "CONFIRMEE" });
      prisma.reservation.update.mockResolvedValue({ id: "r1", statut: "ANNULEE" });

      await service.annuler("r1", { motif: "Client ne se présente pas" }, HOTEL_ID);

      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: "r1", hotelId: HOTEL_ID },
        data: expect.objectContaining({ statut: "ANNULEE", motifAnnulation: "Client ne se présente pas" }),
      });
    });
  });

  describe("confirmer", () => {
    it("refuse de confirmer une réservation qui n'est pas EN_ATTENTE", async () => {
      prisma.reservation.findUnique.mockResolvedValue({ id: "r1", statut: "CONFIRMEE" });
      await expect(service.confirmer("r1", HOTEL_ID)).rejects.toThrow(ConflictException);
    });

    it("refuse de confirmer si la chambre a été prise entre-temps par une réservation occupante", async () => {
      prisma.reservation.findUnique.mockResolvedValue({
        id: "r1",
        statut: "EN_ATTENTE",
        chambreId: "c1",
        dateArrivee: new Date("2026-10-01"),
        dateDepart: new Date("2026-10-03"),
      });
      prisma.reservation.findFirst.mockResolvedValue({ id: "autre" });
      await expect(service.confirmer("r1", HOTEL_ID)).rejects.toThrow(ConflictException);
    });

    it("confirme une demande EN_ATTENTE sans conflit", async () => {
      prisma.reservation.findUnique.mockResolvedValue({
        id: "r1",
        statut: "EN_ATTENTE",
        chambreId: "c1",
        dateArrivee: new Date("2026-10-01"),
        dateDepart: new Date("2026-10-03"),
      });
      prisma.reservation.update.mockResolvedValue({ id: "r1", statut: "CONFIRMEE" });

      await service.confirmer("r1", HOTEL_ID);

      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: "r1", hotelId: HOTEL_ID },
        data: { statut: "CONFIRMEE", syncVersion: { increment: 1 } },
        include: { chambre: true, client: true },
      });
    });
  });

  describe("checkIn / checkOut", () => {
    it("refuse le check-in d'une réservation qui n'est pas CONFIRMEE", async () => {
      prisma.reservation.findUnique.mockResolvedValue({ id: "r1", statut: "EN_COURS", chambreId: "c1" });
      await expect(service.checkIn("r1", HOTEL_ID)).rejects.toThrow(ConflictException);
    });

    it("passe la réservation en EN_COURS et la chambre en OCCUPEE au check-in", async () => {
      prisma.reservation.findUnique.mockResolvedValue({ id: "r1", statut: "CONFIRMEE", chambreId: "c1" });
      prisma.reservation.update.mockResolvedValue({ id: "r1", statut: "EN_COURS" });
      prisma.chambre.update.mockResolvedValue({ id: "c1", statut: "OCCUPEE" });

      await service.checkIn("r1", HOTEL_ID);

      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: "r1", hotelId: HOTEL_ID },
        data: { statut: "EN_COURS", syncVersion: { increment: 1 } },
      });
      expect(prisma.chambre.update).toHaveBeenCalledWith({
        where: { id: "c1", hotelId: HOTEL_ID },
        data: { statut: "OCCUPEE", syncVersion: { increment: 1 } },
      });
    });

    it("refuse le check-out d'une réservation qui n'est pas EN_COURS", async () => {
      prisma.reservation.findUnique.mockResolvedValue({ id: "r1", statut: "CONFIRMEE", chambreId: "c1" });
      await expect(service.checkOut("r1", HOTEL_ID)).rejects.toThrow(ConflictException);
    });

    it("passe la réservation en TERMINEE et la chambre en NETTOYAGE au check-out", async () => {
      prisma.reservation.findUnique.mockResolvedValue({ id: "r1", statut: "EN_COURS", chambreId: "c1" });
      prisma.reservation.update.mockResolvedValue({ id: "r1", statut: "TERMINEE" });
      prisma.chambre.update.mockResolvedValue({ id: "c1", statut: "NETTOYAGE" });

      await service.checkOut("r1", HOTEL_ID);

      expect(prisma.chambre.update).toHaveBeenCalledWith({
        where: { id: "c1", hotelId: HOTEL_ID },
        data: { statut: "NETTOYAGE", syncVersion: { increment: 1 } },
      });
    });
  });
});
