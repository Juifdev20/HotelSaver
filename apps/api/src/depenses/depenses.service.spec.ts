import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";
import { DepensesService } from "./depenses.service";

const HOTEL_ID = "hotel-1";
const receptionniste = { userId: "u-recep", supabaseAuthId: "a1", role: Role.RECEPTIONNISTE, nom: "Rita", hotelId: HOTEL_ID };
const cafetaria = { userId: "u-cafe", supabaseAuthId: "a2", role: Role.CAFETARIA, nom: "Caleb", hotelId: HOTEL_ID };
const patron = { userId: "u-patron", supabaseAuthId: "a3", role: Role.PATRON, nom: "Paul", hotelId: HOTEL_ID, patronPeutOperer: true };

function creerPrismaMock() {
  return {
    depense: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "dep-1", syncVersion: 1, ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "dep-1", syncVersion: 2, ...data })),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    hotel: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ nom: "Hôtel Test", adresse: null, telephoneContact: null, branding: null }),
    },
  } as any;
}

describe("DepensesService", () => {
  let prisma: ReturnType<typeof creerPrismaMock>;
  let storage: { envoyerRapportPdf: jest.Mock; urlSigneeRapport: jest.Mock };
  let service: DepensesService;

  beforeEach(() => {
    prisma = creerPrismaMock();
    storage = { envoyerRapportPdf: jest.fn().mockResolvedValue(undefined), urlSigneeRapport: jest.fn().mockResolvedValue("https://signe") };
    service = new DepensesService(prisma, storage as any);
  });

  describe("creer", () => {
    it("déduit le département du rôle et fige le nom de l'auteur", async () => {
      await service.creer({ date: "2026-10-01", motif: "  Carburant groupe  ", montant: 12.5, devise: "USD" }, receptionniste);
      expect(prisma.depense.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hotelId: HOTEL_ID,
          departement: "RECEPTION",
          date: new Date("2026-10-01T00:00:00.000Z"),
          motif: "Carburant groupe",
          montant: 12.5,
          devise: "USD",
          creeParId: "u-recep",
          creeParNom: "Rita",
        }),
      });
    });

    it("la cafétaria saisit dans le département CAFETERIA", async () => {
      await service.creer({ date: "2026-10-01", motif: "Sucre", montant: 3000, devise: "CDF" }, cafetaria);
      expect(prisma.depense.create.mock.calls[0][0].data.departement).toBe("CAFETERIA");
    });

    it("refuse le patron, même s'il peut opérer", async () => {
      await expect(service.creer({ date: "2026-10-01", motif: "Test", montant: 1, devise: "USD" }, patron)).rejects.toThrow(ForbiddenException);
      expect(prisma.depense.create).not.toHaveBeenCalled();
    });

    it("valide le payload (chemin de synchro sans ValidationPipe)", async () => {
      await expect(service.creer({ date: "01/10/2026", motif: "Sucre", montant: 1, devise: "USD" } as any, cafetaria)).rejects.toThrow(BadRequestException);
      await expect(service.creer({ date: "2026-10-01", motif: "ab", montant: 1, devise: "USD" }, cafetaria)).rejects.toThrow(BadRequestException);
      await expect(service.creer({ date: "2026-10-01", motif: "Sucre", montant: 0, devise: "USD" }, cafetaria)).rejects.toThrow(BadRequestException);
      await expect(service.creer({ date: "2026-10-01", motif: "Sucre", montant: 1, devise: "EUR" } as any, cafetaria)).rejects.toThrow(BadRequestException);
      await expect(service.creer({ date: "2099-01-01", motif: "Sucre", montant: 1, devise: "USD" }, cafetaria)).rejects.toThrow(/futur/);
    });
  });

  describe("modifier", () => {
    it("annule une dépense de son département et incrémente syncVersion", async () => {
      prisma.depense.findFirst.mockResolvedValue({ id: "dep-1", departement: "RECEPTION", annulee: false });
      await service.modifier("dep-1", { annulee: true }, receptionniste);
      const { data } = prisma.depense.update.mock.calls[0][0];
      expect(data).toMatchObject({ annulee: true, syncVersion: { increment: 1 } });
      expect(data.annuleeLe).toBeInstanceOf(Date);
    });

    it("refuse une dépense d'un autre département", async () => {
      prisma.depense.findFirst.mockResolvedValue({ id: "dep-1", departement: "CAFETERIA", annulee: false });
      await expect(service.modifier("dep-1", { motif: "Autre" }, receptionniste)).rejects.toThrow(ForbiddenException);
    });

    it("refuse de modifier une dépense déjà annulée", async () => {
      prisma.depense.findFirst.mockResolvedValue({ id: "dep-1", departement: "RECEPTION", annulee: true });
      await expect(service.modifier("dep-1", { motif: "Autre" }, receptionniste)).rejects.toThrow(BadRequestException);
    });
  });

  describe("lister", () => {
    it("le personnel ne voit que son département, sur la période incluse", async () => {
      await service.lister(cafetaria, { du: "2026-10-01", au: "2026-10-31", departement: "RECEPTION" });
      expect(prisma.depense.findMany.mock.calls[0][0].where).toEqual({
        hotelId: HOTEL_ID,
        departement: "CAFETERIA",
        date: { gte: new Date("2026-10-01T00:00:00.000Z"), lte: new Date("2026-10-31T00:00:00.000Z") },
      });
    });

    it("le patron voit tout, ou le département qu'il choisit", async () => {
      await service.lister(patron, { du: "2026-10-01", au: "2026-10-31" });
      expect(prisma.depense.findMany.mock.calls[0][0].where.departement).toBeUndefined();
      await service.lister(patron, { du: "2026-10-01", au: "2026-10-31", departement: "RECEPTION" });
      expect(prisma.depense.findMany.mock.calls[1][0].where.departement).toBe("RECEPTION");
    });

    it("renvoie la date au format AAAA-MM-JJ", async () => {
      prisma.depense.findMany.mockResolvedValue([{ id: "d", date: new Date("2026-10-05T00:00:00.000Z") }]);
      const [ligne] = await service.lister(receptionniste, { du: "2026-10-01", au: "2026-10-31" });
      expect(ligne.date).toBe("2026-10-05");
    });

    it("refuse une période inversée", async () => {
      await expect(service.lister(receptionniste, { du: "2026-10-31", au: "2026-10-01" })).rejects.toThrow(BadRequestException);
    });
  });

  describe("urlPdf", () => {
    it("génère le PDF des dépenses non annulées, le dépose et renvoie une URL signée", async () => {
      prisma.depense.findMany.mockResolvedValue([
        { date: new Date("2026-10-02T00:00:00.000Z"), motif: "Carburant", montant: "20", devise: "USD", creeParNom: "Rita", departement: "RECEPTION" },
        { date: new Date("2026-10-02T00:00:00.000Z"), motif: "Pain", montant: "15000", devise: "CDF", creeParNom: "Rita", departement: "RECEPTION" },
      ]);
      const r = await service.urlPdf(receptionniste, { du: "2026-10-01", au: "2026-10-31" });
      expect(prisma.depense.findMany.mock.calls[0][0].where).toMatchObject({ annulee: false, departement: "RECEPTION" });
      const [chemin, pdf] = storage.envoyerRapportPdf.mock.calls[0];
      expect(chemin).toMatch(/^hotel-1\/depenses\/.+\.pdf$/);
      expect((pdf as Buffer).subarray(0, 4).toString()).toBe("%PDF");
      expect(r).toEqual({ url: "https://signe" });
    });
  });
});
