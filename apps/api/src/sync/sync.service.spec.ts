import { Role } from "@hotel-chicago/types";
import { SyncService } from "./sync.service";

function creerPrismaMock() {
  return {
    chambre: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    reservation: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    produit: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    mouvementStock: { findMany: jest.fn().mockResolvedValue([]) },
    compteCafeteria: { findMany: jest.fn().mockResolvedValue([]) },
    sousCompte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneCommande: { findMany: jest.fn().mockResolvedValue([]) },
    facture: { findMany: jest.fn().mockResolvedValue([]) },
    venteCafeteria: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

const HOTEL_ID = "hotel-1";
const receptionniste = { userId: "u-recep", supabaseAuthId: "a1", role: Role.RECEPTIONNISTE, nom: "R", hotelId: HOTEL_ID };
const cafetaria = { userId: "u-cafe", supabaseAuthId: "a2", role: Role.CAFETARIA, nom: "C", hotelId: HOTEL_ID };
const patron = { userId: "u-patron", supabaseAuthId: "a3", role: Role.PATRON, nom: "P", hotelId: HOTEL_ID };

describe("SyncService", () => {
  let prisma: ReturnType<typeof creerPrismaMock>;
  let chambresService: any;
  let reservationsService: any;
  let produitsService: any;
  let stockService: any;
  let cafeteriaService: any;
  let service: SyncService;

  beforeEach(() => {
    prisma = creerPrismaMock();
    chambresService = { create: jest.fn(), update: jest.fn() };
    reservationsService = { create: jest.fn(), update: jest.fn() };
    produitsService = { create: jest.fn(), update: jest.fn() };
    stockService = { create: jest.fn() };
    cafeteriaService = { ouvrirCompte: jest.fn(), ajouterSousCompte: jest.fn(), ajouterLigne: jest.fn() };
    service = new SyncService(prisma, chambresService, reservationsService, produitsService, stockService, cafeteriaService);
  });

  describe("push — CREATE", () => {
    it("délègue à ChambresService.create et retourne SYNCED avec le remoteId/syncVersion réels", async () => {
      chambresService.create.mockResolvedValue({ id: "remote-1", syncVersion: 1 });

      const { resultats } = await service.push(
        { operations: [{ entiteType: "Chambre", localId: "local-1", operation: "CREATE", payload: { numero: "101" } }] } as any,
        patron
      );

      expect(resultats).toEqual([{ localId: "local-1", remoteId: "remote-1", syncVersion: 1, statut: "SYNCED" }]);
    });

    it("refuse un CREATE Chambre par un RECEPTIONNISTE (réservé à PATRON)", async () => {
      const { resultats } = await service.push(
        { operations: [{ entiteType: "Chambre", localId: "local-1", operation: "CREATE", payload: {} }] } as any,
        receptionniste
      );
      expect(resultats[0].statut).toBe("ERROR");
      expect(chambresService.create).not.toHaveBeenCalled();
    });

    it("convertit une exception du service métier en statut ERROR sans faire échouer le lot", async () => {
      reservationsService.create.mockRejectedValue(new Error("Chambre déjà réservée sur cette période."));

      const { resultats } = await service.push(
        {
          operations: [{ entiteType: "Reservation", localId: "local-2", operation: "CREATE", payload: {} }],
        } as any,
        receptionniste
      );

      expect(resultats[0].statut).toBe("ERROR");
      expect(resultats[0].message).toContain("déjà réservée");
    });

    it("LigneCommande extrait compteId du payload et délègue à CafeteriaService.ajouterLigne", async () => {
      cafeteriaService.ajouterLigne.mockResolvedValue({ id: "ligne-1", syncVersion: 1 });

      await service.push(
        {
          operations: [
            {
              entiteType: "LigneCommande",
              localId: "local-3",
              operation: "CREATE",
              payload: { compteId: "compte-1", sousCompteId: "sc-1", produitId: "p-1", quantite: 2 },
            },
          ],
        } as any,
        cafetaria
      );

      expect(cafeteriaService.ajouterLigne).toHaveBeenCalledWith(
        "compte-1",
        { sousCompteId: "sc-1", produitId: "p-1", quantite: 2 },
        cafetaria
      );
    });

    it("refuse une LigneCommande sans compteId dans le payload", async () => {
      const { resultats } = await service.push(
        {
          operations: [{ entiteType: "LigneCommande", localId: "local-4", operation: "CREATE", payload: {} }],
        } as any,
        cafetaria
      );
      expect(resultats[0].statut).toBe("ERROR");
      expect(cafeteriaService.ajouterLigne).not.toHaveBeenCalled();
    });
  });

  describe("push — UPDATE et détection de conflit (section 10.4)", () => {
    it("applique la mise à jour quand baseSyncVersion correspond à la version serveur actuelle", async () => {
      prisma.chambre.findUnique.mockResolvedValue({ id: "remote-1", syncVersion: 3 });
      chambresService.update.mockResolvedValue({ id: "remote-1", syncVersion: 4 });

      const { resultats } = await service.push(
        {
          operations: [
            {
              entiteType: "Chambre",
              localId: "local-1",
              remoteId: "remote-1",
              operation: "UPDATE",
              payload: { statut: "OCCUPEE" },
              baseSyncVersion: 3,
            },
          ],
        } as any,
        receptionniste
      );

      expect(chambresService.update).toHaveBeenCalledWith("remote-1", { statut: "OCCUPEE" }, receptionniste);
      expect(resultats[0]).toEqual({ localId: "local-1", remoteId: "remote-1", syncVersion: 4, statut: "SYNCED" });
    });

    it("renvoie CONFLICT sans appliquer le changement si le syncVersion serveur a avancé (le serveur gagne)", async () => {
      prisma.chambre.findUnique.mockResolvedValue({ id: "remote-1", syncVersion: 5, statut: "RESERVEE" });

      const { resultats } = await service.push(
        {
          operations: [
            {
              entiteType: "Chambre",
              localId: "local-1",
              remoteId: "remote-1",
              operation: "UPDATE",
              payload: { statut: "OCCUPEE" },
              baseSyncVersion: 3,
            },
          ],
        } as any,
        receptionniste
      );

      expect(chambresService.update).not.toHaveBeenCalled();
      expect(resultats[0].statut).toBe("CONFLICT");
      expect(resultats[0].syncVersion).toBe(5);
      expect(resultats[0].donneesServeur).toEqual({ id: "remote-1", syncVersion: 5, statut: "RESERVEE" });
    });

    it("refuse une UPDATE sans baseSyncVersion", async () => {
      const { resultats } = await service.push(
        {
          operations: [
            {
              entiteType: "Chambre",
              localId: "local-1",
              remoteId: "remote-1",
              operation: "UPDATE",
              payload: {},
            },
          ],
        } as any,
        receptionniste
      );
      expect(resultats[0].statut).toBe("ERROR");
    });

    it("refuse une UPDATE sur une entité en lecture seule côté sync (ex: MouvementStock)", async () => {
      const { resultats } = await service.push(
        {
          operations: [
            {
              entiteType: "MouvementStock",
              localId: "local-1",
              remoteId: "remote-1",
              operation: "UPDATE",
              payload: {},
              baseSyncVersion: 1,
            },
          ],
        } as any,
        cafetaria
      );
      expect(resultats[0].statut).toBe("ERROR");
    });
  });

  describe("pull", () => {
    it("ne retourne que les types d'entités que le rôle appelant peut lire", async () => {
      await service.pull({ depuis: "2026-01-01T00:00:00.000Z" } as any, receptionniste);

      expect(prisma.chambre.findMany).toHaveBeenCalled();
      expect(prisma.reservation.findMany).toHaveBeenCalled();
      expect(prisma.facture.findMany).toHaveBeenCalled();
      expect(prisma.produit.findMany).not.toHaveBeenCalled();
      expect(prisma.compteCafeteria.findMany).not.toHaveBeenCalled();
    });

    it("un PATRON reçoit tous les types d'entités synchronisables", async () => {
      const resultat = await service.pull({ depuis: "2026-01-01T00:00:00.000Z" } as any, patron);
      expect(Object.keys(resultat).sort()).toEqual(
        [
          "Chambre",
          "Reservation",
          "Produit",
          "MouvementStock",
          "CompteCafeteria",
          "SousCompte",
          "LigneCommande",
          "Facture",
          "VenteCafeteria",
        ].sort()
      );
    });

    it("filtre par la liste `entites` demandée quand elle est fournie", async () => {
      await service.pull({ depuis: "2026-01-01T00:00:00.000Z", entites: "Chambre" } as any, patron);
      expect(prisma.chambre.findMany).toHaveBeenCalled();
      expect(prisma.reservation.findMany).not.toHaveBeenCalled();
    });
  });
});
