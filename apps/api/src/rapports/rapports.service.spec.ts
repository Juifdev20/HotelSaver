import { ForbiddenException } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";
import { RapportsService } from "./rapports.service";

const HOTEL = "hotel-1";
const user = (role: Role, patronPeutOperer = true) => ({
  userId: "u1",
  supabaseAuthId: "a1",
  role,
  nom: "Jean",
  hotelId: HOTEL,
  patronPeutOperer,
});

function prismaMock(over: Partial<Record<string, unknown>> = {}) {
  return {
    rapportMensuel: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: "rap-1" }),
    },
    hotel: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: HOTEL, nom: "Hôtel Test", adresse: null, telephoneContact: null, branding: null }),
    },
    venteCafeteria: { findMany: jest.fn().mockResolvedValue([]) },
    ligneCommande: { findMany: jest.fn().mockResolvedValue([]) },
    utilisateur: { findMany: jest.fn().mockResolvedValue([]) },
    produit: { findMany: jest.fn().mockResolvedValue([]) },
    mouvementStock: { findMany: jest.fn().mockResolvedValue([]) },
    facture: { findMany: jest.fn().mockResolvedValue([]) },
    chambre: { findMany: jest.fn().mockResolvedValue([]) },
    reservation: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation(async (fn) => fn({ rapportMensuel: over.rapportMensuel ?? { updateMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: "rap-1" }) } })),
    ...over,
  } as any;
}

const storageMock = () =>
  ({
    envoyerRapportPdf: jest.fn().mockResolvedValue(undefined),
    urlSigneeRapport: jest.fn().mockResolvedValue("https://x/signe.pdf"),
  }) as any as import("../common/supabase-storage/supabase-storage.service").SupabaseStorageService & {
    envoyerRapportPdf: jest.Mock;
    urlSigneeRapport: jest.Mock;
  };
const notificationsMock = () => ({ emettre: jest.fn().mockResolvedValue(undefined) });

describe("RapportsService", () => {
  describe("generer — séparation des départements", () => {
    it("un réceptionniste ne peut pas générer le rapport cafétaria", async () => {
      const s = new RapportsService(prismaMock(), storageMock() as any, notificationsMock() as any);
      await expect(s.generer(user(Role.RECEPTIONNISTE), { departement: "CAFETERIA", mois: "2026-09" })).rejects.toThrow(ForbiddenException);
    });

    it("un cafetier ne peut pas générer le rapport réception", async () => {
      const s = new RapportsService(prismaMock(), storageMock() as any, notificationsMock() as any);
      await expect(s.generer(user(Role.CAFETARIA), { departement: "RECEPTION", mois: "2026-09" })).rejects.toThrow(ForbiddenException);
    });

    it("un mois dans le futur est refusé", async () => {
      const s = new RapportsService(prismaMock(), storageMock() as any, notificationsMock() as any);
      await expect(s.generer(user(Role.CAFETARIA), { departement: "CAFETERIA", mois: "2030-01" })).rejects.toThrow();
    });

    it("la régénération crée la version N+1 et marque l'ancienne REMPLACE", async () => {
      const prisma = prismaMock({
        rapportMensuel: {
          findFirst: jest.fn().mockResolvedValue({ version: 2 }),
          findMany: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockResolvedValue({ id: "rap-3", numero: "RAP-CAF-202609-003" }),
        },
      });
      const storage = storageMock();
      const s = new RapportsService(prisma, storage, notificationsMock() as any);
      const rapport = await s.generer(user(Role.CAFETARIA), { departement: "CAFETERIA", mois: "2026-09" });
      expect(rapport.id).toBe("rap-3");
      expect(storage.envoyerRapportPdf).toHaveBeenCalledWith(expect.stringContaining("RAP-CAF-202609-003"), expect.any(Buffer));
    });

    it("le PDF envoyé au stockage privé est un vrai PDF", async () => {
      const storage = storageMock();
      const s = new RapportsService(prismaMock(), storage, notificationsMock() as any);
      await s.generer(user(Role.RECEPTIONNISTE), { departement: "RECEPTION", mois: "2026-09" });
      const [chemin, pdf] = storage.envoyerRapportPdf.mock.calls[0] as [string, Buffer];
      expect(chemin).toContain(HOTEL);
      expect(chemin).toContain("RAP-REC-202609-001.pdf");
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    });
  });

  describe("lister / urlTelechargement — droits de lecture", () => {
    it("le personnel ne liste que son département", async () => {
      const prisma = prismaMock();
      const s = new RapportsService(prisma, storageMock() as any, notificationsMock() as any);
      await s.lister(user(Role.CAFETARIA));
      expect(prisma.rapportMensuel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ departement: "CAFETERIA" }) })
      );
    });

    it("un réceptionniste ne peut pas ouvrir un rapport cafétaria", async () => {
      const prisma = prismaMock({
        rapportMensuel: { findFirst: jest.fn().mockResolvedValue({ id: "r1", departement: "CAFETERIA", fichier: "h/2026-09/x.pdf" }) },
      });
      const s = new RapportsService(prisma, storageMock() as any, notificationsMock() as any);
      await expect(s.urlTelechargement(user(Role.RECEPTIONNISTE), "r1")).rejects.toThrow(ForbiddenException);
    });

    it("le patron ouvre n'importe quel département (URL signée)", async () => {
      const prisma = prismaMock({
        rapportMensuel: { findFirst: jest.fn().mockResolvedValue({ id: "r1", departement: "CAFETERIA", fichier: "h/2026-09/x.pdf" }) },
      });
      const storage = storageMock();
      const s = new RapportsService(prisma, storage, notificationsMock() as any);
      const { url } = await s.urlTelechargement(user(Role.PATRON), "r1");
      expect(url).toBe("https://x/signe.pdf");
      expect(storage.urlSigneeRapport).toHaveBeenCalledWith("h/2026-09/x.pdf", 300);
    });
  });
});
