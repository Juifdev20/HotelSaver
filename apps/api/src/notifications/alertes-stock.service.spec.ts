import { AlertesStockService, TOUS_LES_PRODUITS } from "./alertes-stock.service";

const MOI = { userId: "u1", supabaseAuthId: "a1", role: "CAFETARIA", nom: "Caf", hotelId: "hotel-A" } as any;

function creer(lignes: { produitId: string }[] = []) {
  const prisma = {
    alerteStockCoupee: {
      findMany: jest.fn().mockResolvedValue(lignes),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    produit: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
  } as any;
  return { prisma, service: new AlertesStockService(prisma) };
}

describe("AlertesStockService", () => {
  it("dit si tout est coupé et quels produits le sont, pour MOI et dans MON hôtel seulement", async () => {
    const { service, prisma } = creer([{ produitId: "p1" }, { produitId: TOUS_LES_PRODUITS }]);
    expect(await service.lister(MOI)).toEqual({ toutes: true, produitIds: ["p1"] });
    expect(prisma.alerteStockCoupee.findMany.mock.calls[0][0].where).toEqual({ utilisateurId: "u1", hotelId: "hotel-A" });
  });

  it("couper un produit l'enregistre une seule fois (upsert) ; couper sans produit coupe tout", async () => {
    const { service, prisma } = creer();
    await service.couper(MOI, "p1");
    await service.couper(MOI, null);
    const appels = prisma.alerteStockCoupee.upsert.mock.calls.map((c: any[]) => c[0].where.utilisateurId_produitId.produitId);
    expect(appels).toEqual(["p1", TOUS_LES_PRODUITS]);
  });

  it("n'enregistre pas la coupure d'un produit d'un AUTRE hôtel", async () => {
    const { service, prisma } = creer();
    prisma.produit.findFirst.mockResolvedValue(null);
    await service.couper(MOI, "produit-d-un-autre-hotel");
    expect(prisma.produit.findFirst.mock.calls[0][0].where).toEqual({ id: "produit-d-un-autre-hotel", hotelId: "hotel-A" });
    expect(prisma.alerteStockCoupee.upsert).not.toHaveBeenCalled();
  });

  it("réactiver retire la coupure de ce produit (ou de tout) pour moi seul", async () => {
    const { service, prisma } = creer();
    await service.reactiver(MOI, "p1");
    expect(prisma.alerteStockCoupee.deleteMany.mock.calls[0][0].where).toEqual({ utilisateurId: "u1", hotelId: "hotel-A", produitId: "p1" });
  });

  it("les utilisateurs ayant coupé un produit incluent ceux qui ont tout coupé", async () => {
    const { service, prisma } = creer([]);
    prisma.alerteStockCoupee.findMany.mockResolvedValue([{ utilisateurId: "u1" }, { utilisateurId: "u2" }]);
    expect([...(await service.utilisateursAyantCoupe("hotel-A", "p1"))]).toEqual(["u1", "u2"]);
    expect(prisma.alerteStockCoupee.findMany.mock.calls[0][0].where).toEqual({ hotelId: "hotel-A", produitId: { in: ["p1", TOUS_LES_PRODUITS] } });
  });
});
