import { ConflictException } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";

const U1 = "6f1c2f0e-8f3a-4c1b-9c55-0a1b2c3d4e5f";
const U2 = "7a1c2f0e-8f3a-4c1b-9c55-0a1b2c3d4e5f";
const U3 = "8b1c2f0e-8f3a-4c1b-9c55-0a1b2c3d4e5f";
import { SyncService } from "./sync.service";

function creerPrismaMock() {
  return {
    chambre: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    reservation: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    client: { findMany: jest.fn().mockResolvedValue([]) },
    produit: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    mouvementStock: { findMany: jest.fn().mockResolvedValue([]) },
    compteCafeteria: { findMany: jest.fn().mockResolvedValue([]) },
    sousCompte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneCommande: { findMany: jest.fn().mockResolvedValue([]) },
    facture: { findMany: jest.fn().mockResolvedValue([]) },
    venteCafeteria: { findMany: jest.fn().mockResolvedValue([]) },
    depense: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    suppression: { findMany: jest.fn().mockResolvedValue([]) },
    syncCorrespondance: {
      create: jest.fn().mockResolvedValue({ id: "corr-1" }),
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
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
  let depensesService: any;
  let facturesService: any;
  let service: SyncService;

  beforeEach(() => {
    prisma = creerPrismaMock();
    chambresService = { create: jest.fn(), update: jest.fn() };
    reservationsService = { create: jest.fn(), update: jest.fn() };
    produitsService = { create: jest.fn(), update: jest.fn() };
    stockService = { create: jest.fn() };
    cafeteriaService = { ouvrirCompte: jest.fn(), ajouterSousCompte: jest.fn(), ajouterLigne: jest.fn() };
    depensesService = { creer: jest.fn(), modifier: jest.fn() };
    facturesService = { create: jest.fn() };
    service = new SyncService(prisma, chambresService, reservationsService, produitsService, stockService, cafeteriaService, depensesService, facturesService, { update: jest.fn() } as any);
  });

  describe("push — CREATE", () => {
    it("délègue à ChambresService.create et retourne SYNCED avec le remoteId/syncVersion réels", async () => {
      chambresService.create.mockResolvedValue({ id: "remote-1", syncVersion: 1 });

      const { resultats } = await service.push(
        { operations: [{ entiteType: "Chambre", localId: "local-1", operation: "CREATE", payload: { numero: "101", type: "Standard", prixParNuit: 40, devise: "USD" } }] } as any,
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
      reservationsService.create.mockRejectedValue(new ConflictException("Chambre déjà réservée sur cette période."));

      const { resultats } = await service.push(
        {
          operations: [
            {
              entiteType: "Reservation",
              localId: "local-2",
              operation: "CREATE",
              payload: { chambreId: "6f1c2f0e-8f3a-4c1b-9c55-0a1b2c3d4e5f", clientId: "7a1c2f0e-8f3a-4c1b-9c55-0a1b2c3d4e5f", dateArrivee: "2026-10-12", dateDepart: "2026-10-14" },
            },
          ],
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
              payload: { compteId: "compte-1", sousCompteId: U1, produitId: U2, quantite: 2 },
            },
          ],
        } as any,
        cafetaria
      );

      expect(cafeteriaService.ajouterLigne).toHaveBeenCalledWith(
        "compte-1",
        { sousCompteId: U1, produitId: U2, quantite: 2 },
        cafetaria,
        { horsLigne: true }
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

  describe("push — séparation des tâches (le patron n'opère pas par défaut)", () => {
    const operation = (entiteType: string, operation = "CREATE", extra: object = {}) =>
      ({ operations: [{ entiteType, localId: "l1", operation, payload: { compteId: "c1" }, ...extra }] }) as any;

    it.each(["Reservation", "CompteCafeteria", "SousCompte", "LigneCommande"])(
      "refuse un CREATE %s par le patron par défaut (ERROR, aucun service appelé)",
      async (entite) => {
        const { resultats } = await service.push(operation(entite), patron);
        expect(resultats[0].statut).toBe("ERROR");
        expect(resultats[0].message).toMatch(/Le patron ne réalise pas les opérations du quotidien/);
        expect(reservationsService.create).not.toHaveBeenCalled();
        expect(cafeteriaService.ouvrirCompte).not.toHaveBeenCalled();
        expect(cafeteriaService.ajouterLigne).not.toHaveBeenCalled();
      }
    );

    it("refuse aussi la MODIFICATION d'une réservation par le patron par défaut", async () => {
      const { resultats } = await service.push(operation("Reservation", "UPDATE", { remoteId: "r1", baseSyncVersion: 1 }), patron);
      expect(resultats[0].statut).toBe("ERROR");
      expect(reservationsService.update).not.toHaveBeenCalled();
    });

    it("accepte quand l'hôtel a autorisé le patron à opérer", async () => {
      cafeteriaService.ajouterLigne.mockResolvedValue({ id: "ligne-1", syncVersion: 1 });
      const { resultats } = await service.push(
        { operations: [{ entiteType: "LigneCommande", localId: "l1", operation: "CREATE", payload: { compteId: "c1", sousCompteId: U1, produitId: U2, quantite: 1 } }] } as any,
        { ...patron, patronPeutOperer: true }
      );
      expect(resultats[0].statut).toBe("SYNCED");
    });

    it("la cafétaria et la réception synchronisent comme avant, et le patron garde l'administration (Produit)", async () => {
      cafeteriaService.ouvrirCompte.mockResolvedValue({ id: "c-remote", syncVersion: 1, sousComptes: [] });
      produitsService.create.mockResolvedValue({ id: "p-remote", syncVersion: 1 });
      const caf = await service.push(operation("CompteCafeteria", "CREATE", { payload: { tableOuNom: "Table 4" } }), cafetaria);
      expect(caf.resultats[0].statut).toBe("SYNCED");
      const prod = await service.push({ operations: [{ entiteType: "Produit", localId: "l2", operation: "CREATE", payload: { nom: "Fanta", categorie: "Boissons", prix: 2, devise: "USD" } }] } as any, patron);
      expect(prod.resultats[0].statut).toBe("SYNCED");
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
      expect(prisma.client.findMany).toHaveBeenCalled();
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
          "Client",
          "Produit",
          "MouvementStock",
          "CompteCafeteria",
          "SousCompte",
          "LigneCommande",
          "Facture",
          "VenteCafeteria",
          "Depense",
          "_meta",
        ].sort()
      );
    });

    it("renvoie le curseur serveur, l'indicateur de troncature et les suppressions", async () => {
      prisma.suppression.findMany.mockResolvedValue([{ entiteType: "Produit", entiteId: "p-9", createdAt: new Date("2026-10-10T08:00:00.000Z") }]);
      const resultat: any = await service.pull({ depuis: "2026-01-01T00:00:00.000Z" } as any, patron);
      expect(resultat._meta.tronque).toEqual([]);
      expect(typeof resultat._meta.serveurLe).toBe("string");
      expect(resultat._meta.suppressions).toEqual([{ entiteType: "Produit", id: "p-9", supprimeLe: "2026-10-10T08:00:00.000Z" }]);
    });

    it("filtre par la liste `entites` demandée quand elle est fournie", async () => {
      await service.pull({ depuis: "2026-01-01T00:00:00.000Z", entites: "Chambre" } as any, patron);
      expect(prisma.chambre.findMany).toHaveBeenCalled();
      expect(prisma.reservation.findMany).not.toHaveBeenCalled();
    });

    it("Depense : chaque département ne reçoit que ses propres dépenses, le patron reçoit tout", async () => {
      await service.pull({ depuis: "2026-01-01T00:00:00.000Z", entites: "Depense" } as any, receptionniste);
      expect(prisma.depense.findMany.mock.calls[0][0].where).toMatchObject({ hotelId: HOTEL_ID, departement: "RECEPTION" });

      await service.pull({ depuis: "2026-01-01T00:00:00.000Z", entites: "Depense" } as any, cafetaria);
      expect(prisma.depense.findMany.mock.calls[1][0].where).toMatchObject({ departement: "CAFETERIA" });

      await service.pull({ depuis: "2026-01-01T00:00:00.000Z", entites: "Depense" } as any, patron);
      expect(prisma.depense.findMany.mock.calls[2][0].where).not.toHaveProperty("departement");
    });
  });

  describe("Depense", () => {
    it("CREATE par la réception : délègue à DepensesService.creer", async () => {
      depensesService.creer.mockResolvedValue({ id: "dep-1", syncVersion: 1 });
      const r = await service.push(
        { operations: [{ entiteType: "Depense", localId: "l-1", operation: "CREATE", payload: { date: "2026-10-07", motif: "Savon", montant: 5, devise: "USD" } }] } as any,
        receptionniste
      );
      expect(r.resultats[0]).toMatchObject({ statut: "SYNCED", remoteId: "dep-1" });
      expect(depensesService.creer).toHaveBeenCalledWith(expect.objectContaining({ motif: "Savon" }), receptionniste);
    });

    it("le patron ne peut pas créer de dépense via la synchronisation", async () => {
      const r = await service.push(
        { operations: [{ entiteType: "Depense", localId: "l-1", operation: "CREATE", payload: {} }] } as any,
        { ...patron, patronPeutOperer: true }
      );
      expect(r.resultats[0].statut).toBe("ERROR");
      expect(depensesService.creer).not.toHaveBeenCalled();
    });

    it("UPDATE avec un syncVersion à jour : délègue à DepensesService.modifier", async () => {
      prisma.depense.findUnique.mockResolvedValue({ id: "dep-1", syncVersion: 1, departement: "CAFETERIA" });
      depensesService.modifier.mockResolvedValue({ id: "dep-1", syncVersion: 2 });
      const r = await service.push(
        { operations: [{ entiteType: "Depense", localId: "l-1", remoteId: "dep-1", operation: "UPDATE", baseSyncVersion: 1, payload: { annulee: true } }] } as any,
        cafetaria
      );
      expect(r.resultats[0]).toMatchObject({ statut: "SYNCED", syncVersion: 2 });
      expect(depensesService.modifier).toHaveBeenCalledWith("dep-1", { annulee: true }, cafetaria);
    });
  });
});
