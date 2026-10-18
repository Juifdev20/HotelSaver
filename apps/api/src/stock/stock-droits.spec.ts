import { ForbiddenException } from "@nestjs/common";
import { MESSAGE_MOUVEMENT_RESERVE_PATRON } from "@hotel-chicago/regles";
import { StockService } from "./stock.service";

/** Mouvements manuels (18/10/2026) : la caisse n'enregistre que des ENTRÉES ; PERTE et AJUSTEMENT réservés au patron. */
describe("StockService.create — droits par rôle", () => {
  function monter() {
    const prisma: any = {
      produit: { findUnique: jest.fn().mockResolvedValue({ id: "p1", nom: "Primus", stockActuel: 10 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      mouvementStock: { create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "m1", ...data })) },
    };
    return { prisma, service: new StockService(prisma, { emettre: jest.fn() } as any, {} as any) };
  }

  it("CAFETARIA : ENTREE acceptée", async () => {
    const { service, prisma } = monter();
    await service.create({ produitId: "p1", type: "ENTREE", quantite: 3 } as any, "u-caisse", "h1", "CAFETARIA");
    expect(prisma.mouvementStock.create).toHaveBeenCalled();
  });

  it.each(["PERTE", "AJUSTEMENT"])("CAFETARIA : %s refusé (403), stock intact", async (type) => {
    const { service, prisma } = monter();
    const essai = service.create({ produitId: "p1", type, quantite: 1 } as any, "u-caisse", "h1", "CAFETARIA");
    await expect(essai).rejects.toBeInstanceOf(ForbiddenException);
    await expect(essai).rejects.toThrow(MESSAGE_MOUVEMENT_RESERVE_PATRON);
    expect(prisma.produit.updateMany).not.toHaveBeenCalled();
  });

  it.each(["ENTREE", "PERTE", "AJUSTEMENT"])("PATRON : %s accepté", async (type) => {
    const { service, prisma } = monter();
    await service.create({ produitId: "p1", type, quantite: 1 } as any, "u-patron", "h1", "PATRON");
    expect(prisma.mouvementStock.create).toHaveBeenCalled();
  });
});
