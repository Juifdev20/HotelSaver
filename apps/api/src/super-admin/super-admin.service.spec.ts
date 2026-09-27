jest.mock("../common/palette/extraire-couleurs-logo");

import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@hotel-chicago/database";
import { SuperAdminService } from "./super-admin.service";
import { PALETTE_DEFAUT } from "../common/palette-defaut";
import { extraireCouleursLogo } from "../common/palette/extraire-couleurs-logo";
import { DUREE_ESSAI_JOURS } from "./calculer-validite";

function creerPrismaMock() {
  const prisma: any = {
    hotel: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    paiementLicence: { create: jest.fn() },
    $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
  };
  return prisma;
}

describe("SuperAdminService", () => {
  let prisma: ReturnType<typeof creerPrismaMock>;
  let service: SuperAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = creerPrismaMock();
    service = new SuperAdminService(prisma);
    (extraireCouleursLogo as jest.Mock).mockResolvedValue(null);
  });

  describe("creerHotel", () => {
    it("crée l'hôtel avec statutLicence ACTIF (jamais ESSAI) et sa charte graphique par défaut", async () => {
      prisma.hotel.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "h2", ...data }));

      await service.creerHotel({ nom: "Hôtel Test", sousDomaine: "test" } as any);

      expect(prisma.hotel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nom: "Hôtel Test",
            sousDomaine: "test",
            statutLicence: "ACTIF",
            branding: { create: { palette: PALETTE_DEFAUT } },
          }),
        })
      );
    });

    it("convertit une violation de contrainte unique sur sousDomaine en message clair", async () => {
      prisma.hotel.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("unique violation", { code: "P2002", clientVersion: "7.10.0" })
      );
      await expect(service.creerHotel({ nom: "X", sousDomaine: "chicago" } as any)).rejects.toThrow(
        ConflictException
      );
    });

    it("dérive la palette du logo quand logoUrl est fourni", async () => {
      (extraireCouleursLogo as jest.Mock).mockResolvedValue({ bleu: "#FF0000", navy: "#111111" });
      prisma.hotel.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "h2", ...data }));

      await service.creerHotel({ nom: "X", sousDomaine: "x", logoUrl: "https://exemple.com/logo.png" } as any);

      expect(extraireCouleursLogo).toHaveBeenCalledWith("https://exemple.com/logo.png");
      const appel = prisma.hotel.create.mock.calls[0][0];
      expect(appel.data.branding.create.palette).not.toEqual(PALETTE_DEFAUT);
      expect(appel.data.branding.create.logoUrl).toBe("https://exemple.com/logo.png");
    });
  });

  describe("changerStatut", () => {
    it("lève NotFoundException si l'hôtel n'existe pas", async () => {
      prisma.hotel.findUnique.mockResolvedValue(null);
      await expect(service.changerStatut("inconnu", { statutLicence: "SUSPENDU" } as any)).rejects.toThrow(
        NotFoundException
      );
    });

    it("met à jour statutLicence pour un hôtel existant", async () => {
      prisma.hotel.findUnique.mockResolvedValue({ id: "h1", statutLicence: "ACTIF" });
      prisma.hotel.update.mockResolvedValue({ id: "h1", statutLicence: "SUSPENDU" });

      await service.changerStatut("h1", { statutLicence: "SUSPENDU" } as any);

      expect(prisma.hotel.update).toHaveBeenCalledWith({
        where: { id: "h1" },
        data: { statutLicence: "SUSPENDU" },
      });
    });
  });

  describe("findAllHotels", () => {
    it("calcule valideJusquau à partir du dernier paiement quand il existe", async () => {
      const periodeCouverteJusquau = new Date("2027-01-01T00:00:00.000Z");
      prisma.hotel.findMany.mockResolvedValue([
        {
          id: "h1",
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
          paiementsLicence: [{ periodeCouverteJusquau }],
        },
      ]);

      const [resultat] = await service.findAllHotels();

      expect(resultat.valideJusquau).toEqual(periodeCouverteJusquau);
      expect((resultat as any).paiementsLicence).toBeUndefined();
      expect(prisma.hotel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { branding: true, paiementsLicence: { orderBy: { periodeCouverteJusquau: "desc" }, take: 1 } },
        })
      );
    });

    it("sans paiement, calcule valideJusquau depuis createdAt + 14 jours (essai)", async () => {
      const createdAt = new Date("2026-09-01T00:00:00.000Z");
      prisma.hotel.findMany.mockResolvedValue([{ id: "h1", createdAt, paiementsLicence: [] }]);

      const [resultat] = await service.findAllHotels();

      const attendu = new Date(createdAt);
      attendu.setDate(attendu.getDate() + DUREE_ESSAI_JOURS);
      expect(resultat.valideJusquau).toEqual(attendu);
    });
  });

  describe("enregistrerPaiement", () => {
    const dto = {
      montant: 50,
      devise: "USD",
      methode: "MOBILE_MONEY",
      periodeCouverteJusquau: "2027-01-01T00:00:00.000Z",
      note: "Payé via Airtel Money",
    };

    it("lève NotFoundException si l'hôtel n'existe pas", async () => {
      prisma.hotel.findUnique.mockResolvedValue(null);
      await expect(service.enregistrerPaiement("inconnu", dto as any, "admin-1")).rejects.toThrow(NotFoundException);
    });

    it("crée le PaiementLicence et remet l'hôtel à ACTIF", async () => {
      prisma.hotel.findUnique.mockResolvedValue({ id: "h1", statutLicence: "SUSPENDU" });
      prisma.paiementLicence.create.mockResolvedValue({ id: "p1", ...dto, hotelId: "h1" });

      const resultat = await service.enregistrerPaiement("h1", dto as any, "admin-1");

      expect(prisma.paiementLicence.create).toHaveBeenCalledWith({
        data: {
          hotelId: "h1",
          montant: 50,
          devise: "USD",
          methode: "MOBILE_MONEY",
          periodeCouverteJusquau: new Date(dto.periodeCouverteJusquau),
          note: "Payé via Airtel Money",
          enregistreParSuperAdminId: "admin-1",
        },
      });
      expect(prisma.hotel.update).toHaveBeenCalledWith({ where: { id: "h1" }, data: { statutLicence: "ACTIF" } });
      expect(resultat).toEqual({ id: "p1", ...dto, hotelId: "h1" });
    });

    it("réactive même un hôtel RESILIE", async () => {
      prisma.hotel.findUnique.mockResolvedValue({ id: "h1", statutLicence: "RESILIE" });
      prisma.paiementLicence.create.mockResolvedValue({ id: "p1" });

      await service.enregistrerPaiement("h1", dto as any, "admin-1");

      expect(prisma.hotel.update).toHaveBeenCalledWith({ where: { id: "h1" }, data: { statutLicence: "ACTIF" } });
    });
  });

  describe("suspendreHotelsExpires", () => {
    it("suspend les hôtels ESSAI/ACTIF dont la date de validité est dépassée", async () => {
      const hier = new Date();
      hier.setDate(hier.getDate() - 1);
      const demain = new Date();
      demain.setDate(demain.getDate() + 1);

      prisma.hotel.findMany.mockResolvedValue([
        { id: "expire-1", sousDomaine: "expire-1", createdAt: new Date(), paiementsLicence: [{ periodeCouverteJusquau: hier }] },
        { id: "encore-valide", sousDomaine: "encore-valide", createdAt: new Date(), paiementsLicence: [{ periodeCouverteJusquau: demain }] },
      ]);

      const nombre = await service.suspendreHotelsExpires();

      expect(nombre).toBe(1);
      expect(prisma.hotel.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["expire-1"] } },
        data: { statutLicence: "SUSPENDU" },
      });
    });

    it("ne fait rien si aucun hôtel n'a expiré", async () => {
      const demain = new Date();
      demain.setDate(demain.getDate() + 1);
      prisma.hotel.findMany.mockResolvedValue([
        { id: "ok", sousDomaine: "ok", createdAt: new Date(), paiementsLicence: [{ periodeCouverteJusquau: demain }] },
      ]);

      const nombre = await service.suspendreHotelsExpires();

      expect(nombre).toBe(0);
      expect(prisma.hotel.updateMany).not.toHaveBeenCalled();
    });

    it("ne considère que ESSAI/ACTIF (jamais RESILIE/SUSPENDU déjà)", async () => {
      prisma.hotel.findMany.mockResolvedValue([]);
      await service.suspendreHotelsExpires();
      expect(prisma.hotel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { statutLicence: { in: ["ESSAI", "ACTIF"] } } })
      );
    });
  });
});
