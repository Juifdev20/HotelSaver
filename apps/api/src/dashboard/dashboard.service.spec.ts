import { Role } from "@hotel-chicago/types";
import { DashboardService } from "./dashboard.service";

function creerPrismaMock() {
  return {
    facture: { findMany: jest.fn().mockResolvedValue([]) },
    venteCafeteria: { findMany: jest.fn().mockResolvedValue([]) },
    chambre: { findMany: jest.fn().mockResolvedValue([]) },
    reservation: { findMany: jest.fn().mockResolvedValue([]) },
    produit: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

const HOTEL_ID = "hotel-1";
const receptionniste = { userId: "u-recep", supabaseAuthId: "a1", role: Role.RECEPTIONNISTE, nom: "R", hotelId: HOTEL_ID };
const cafetaria = { userId: "u-cafe", supabaseAuthId: "a2", role: Role.CAFETARIA, nom: "C", hotelId: HOTEL_ID };
const patron = { userId: "u-patron", supabaseAuthId: "a3", role: Role.PATRON, nom: "P", hotelId: HOTEL_ID };

describe("DashboardService", () => {
  let prisma: ReturnType<typeof creerPrismaMock>;
  let service: DashboardService;

  beforeEach(() => {
    prisma = creerPrismaMock();
    service = new DashboardService(prisma);
  });

  describe("recetteDuJour", () => {
    it("compte l'acompte pris à la réception : un séjour payé d'avance (facture à 0) apparaît quand même (13/11/2026)", async () => {
      prisma.facture.findMany.mockResolvedValue([{ montantTotalUSD: 0, montantTotalCDF: 0 }]);
      prisma.reservation.findMany.mockResolvedValue([
        { acompte: 180, statut: "EN_COURS", origine: "RECEPTION", createdBy: "u-recep", createdAt: new Date(), chambre: { devise: "USD" } },
      ]);

      const resultat = await service.recetteDuJour(receptionniste);

      expect(resultat.chambres).toEqual({ montantUSD: 180, montantCDF: 0 });
      expect(prisma.reservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ createdBy: "u-recep", origine: "RECEPTION" }) })
      );
    });

    it("le patron voit les acomptes de toute la réception, sans filtre par utilisateur ; le reste payé au départ s'ajoute sans doublon", async () => {
      prisma.facture.findMany.mockResolvedValue([{ montantTotalUSD: 60, montantTotalCDF: 0 }]);
      prisma.reservation.findMany.mockResolvedValue([
        { acompte: 100, statut: "CONFIRMEE", origine: "RECEPTION", createdBy: "u-recep", createdAt: new Date(), chambre: { devise: "USD" } },
        { acompte: 20000, statut: "CONFIRMEE", origine: "RECEPTION", createdBy: "u-autre", createdAt: new Date(), chambre: { devise: "CDF" } },
      ]);

      const resultat = await service.recetteDuJour(patron);

      expect(resultat.chambres).toEqual({ montantUSD: 160, montantCDF: 20000 });
      expect(prisma.reservation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ createdBy: undefined }) }));
    });

    it("la cafétaria ne touche jamais aux acomptes", async () => {
      await service.recetteDuJour(cafetaria);
      expect(prisma.reservation.findMany).not.toHaveBeenCalled();
    });

    it("un RECEPTIONNISTE ne voit que ses propres factures, jamais la cafétaria", async () => {
      prisma.facture.findMany.mockResolvedValue([{ montantTotalUSD: 45, montantTotalCDF: 0 }]);

      const resultat = await service.recetteDuJour(receptionniste);

      expect(resultat.chambres).toEqual({ montantUSD: 45, montantCDF: 0 });
      expect(resultat.cafeteria).toBeUndefined();
      expect(prisma.facture.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdBy: "u-recep" }),
        })
      );
      expect(prisma.venteCafeteria.findMany).not.toHaveBeenCalled();
    });

    it("un CAFETARIA ne voit que ses propres ventes, jamais les chambres", async () => {
      prisma.venteCafeteria.findMany.mockResolvedValue([{ montantTotalUSD: 9, montantTotalCDF: 0 }]);

      const resultat = await service.recetteDuJour(cafetaria);

      expect(resultat.cafeteria).toEqual({ montantUSD: 9, montantCDF: 0 });
      expect(resultat.chambres).toBeUndefined();
      expect(prisma.venteCafeteria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ createdBy: "u-cafe" }) })
      );
      expect(prisma.facture.findMany).not.toHaveBeenCalled();
    });

    it("un PATRON voit tout, sans filtre par utilisateur, et le total additionne les deux sources par devise", async () => {
      prisma.facture.findMany.mockResolvedValue([{ montantTotalUSD: 70, montantTotalCDF: 0 }]);
      prisma.venteCafeteria.findMany.mockResolvedValue([{ montantTotalUSD: 12, montantTotalCDF: 5000 }]);

      const resultat = await service.recetteDuJour(patron);

      expect(resultat.chambres).toEqual({ montantUSD: 70, montantCDF: 0 });
      expect(resultat.cafeteria).toEqual({ montantUSD: 12, montantCDF: 5000 });
      expect(resultat.total).toEqual({ montantUSD: 82, montantCDF: 5000 });
      expect(prisma.facture.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ createdBy: undefined }) })
      );
    });

    it("exclut toujours les factures et ventes annulées", async () => {
      await service.recetteDuJour(patron);
      expect(prisma.facture.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ annuleLe: null }) })
      );
      expect(prisma.venteCafeteria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ annuleLe: null }) })
      );
    });
  });

  describe("occupation", () => {
    it("calcule le taux d'occupation correctement", async () => {
      prisma.chambre.findMany.mockResolvedValue([
        { statut: "OCCUPEE" },
        { statut: "OCCUPEE" },
        { statut: "LIBRE" },
        { statut: "RESERVEE" },
      ]);

      const resultat = await service.occupation(HOTEL_ID);

      expect(resultat.total).toBe(4);
      expect(resultat.occupees).toBe(2);
      expect(resultat.tauxOccupationPourcent).toBe(50);
    });

    it("ne divise jamais par zéro s'il n'y a aucune chambre", async () => {
      prisma.chambre.findMany.mockResolvedValue([]);
      const resultat = await service.occupation(HOTEL_ID);
      expect(resultat.tauxOccupationPourcent).toBe(0);
    });
  });

  describe("stockBas", () => {
    it("ne retourne que les produits actifs sous leur seuil d'alerte", async () => {
      prisma.produit.findMany.mockResolvedValue([
        { nom: "Coca", stockActuel: 2, seuilAlerte: 5 },
        { nom: "Fanta", stockActuel: 10, seuilAlerte: 5 },
        { nom: "Eau", stockActuel: 5, seuilAlerte: 5 },
      ]);

      const resultat = await service.stockBas(HOTEL_ID);

      expect(resultat.map((p: any) => p.nom)).toEqual(["Coca", "Eau"]);
    });
  });
});
