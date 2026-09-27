import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CafeteriaService } from "./cafeteria.service";

function creerPrismaMock() {
  const prisma: any = {
    compteCafeteria: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    sousCompte: { create: jest.fn() },
    ligneCommande: { create: jest.fn() },
    mouvementStock: { create: jest.fn().mockResolvedValue({}) },
    venteCafeteria: {
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    produit: { findUnique: jest.fn() },
    reservation: { findUnique: jest.fn() },
    tauxChange: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((fn: any) => fn(prisma)),
  };
  return prisma;
}

const HOTEL_ID = "hotel-1";
const currentUser = { userId: "u1", supabaseAuthId: "a1", role: "CAFETARIA", nom: "Serveur", hotelId: HOTEL_ID } as any;

describe("CafeteriaService", () => {
  let prisma: ReturnType<typeof creerPrismaMock>;
  let stockService: { enregistrerMouvement: jest.Mock; decrementerStock: jest.Mock };
  let service: CafeteriaService;

  beforeEach(() => {
    prisma = creerPrismaMock();
    stockService = { enregistrerMouvement: jest.fn().mockResolvedValue({}), decrementerStock: jest.fn().mockResolvedValue(undefined) };
    service = new CafeteriaService(prisma, stockService as any);
  });

  describe("ouvrirCompte", () => {
    it("crée un premier sous-compte par défaut nommé 'Personne 1'", async () => {
      prisma.compteCafeteria.create.mockResolvedValue({});
      await service.ouvrirCompte({ tableOuNom: "Table 4" } as any, currentUser);
      expect(prisma.compteCafeteria.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sousComptes: { create: [{ hotelId: HOTEL_ID, nom: "Personne 1" }] } }),
        })
      );
    });

    it("utilise le nom fourni pour le premier sous-compte s'il est précisé", async () => {
      prisma.compteCafeteria.create.mockResolvedValue({});
      await service.ouvrirCompte({ tableOuNom: "Table 4", nomPremierSousCompte: "Jean" } as any, currentUser);
      expect(prisma.compteCafeteria.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sousComptes: { create: [{ hotelId: HOTEL_ID, nom: "Jean" }] } }),
        })
      );
    });
  });

  describe("ajouterLigne", () => {
    const compteOuvert = {
      id: "c1",
      statut: "OUVERT",
      tableOuNom: "Table 4",
      sousComptes: [{ id: "sc1", lignes: [] }],
    };

    it("refuse si le sous-compte n'appartient pas au compte", async () => {
      prisma.compteCafeteria.findUnique.mockResolvedValue(compteOuvert);
      await expect(
        service.ajouterLigne("c1", { sousCompteId: "autre", produitId: "p1", quantite: 1 } as any, currentUser)
      ).rejects.toThrow(NotFoundException);
    });

    it("refuse d'ajouter une ligne sur un compte déjà fermé", async () => {
      prisma.compteCafeteria.findUnique.mockResolvedValue({ ...compteOuvert, statut: "FERME" });
      await expect(
        service.ajouterLigne("c1", { sousCompteId: "sc1", produitId: "p1", quantite: 1 } as any, currentUser)
      ).rejects.toThrow(ConflictException);
    });

    it("refuse un produit inactif", async () => {
      prisma.compteCafeteria.findUnique.mockResolvedValue(compteOuvert);
      prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Bière", actif: false });
      await expect(
        service.ajouterLigne("c1", { sousCompteId: "sc1", produitId: "p1", quantite: 1 } as any, currentUser)
      ).rejects.toThrow(ConflictException);
    });

    it("copie le prix et la devise du produit sur la ligne, et décrémente le stock", async () => {
      prisma.compteCafeteria.findUnique.mockResolvedValue(compteOuvert);
      prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Bière", actif: true, prix: 3, devise: "USD" });
      prisma.ligneCommande.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const ligne = await service.ajouterLigne(
        "c1",
        { sousCompteId: "sc1", produitId: "p1", quantite: 2 } as any,
        currentUser
      );

      expect(ligne.prixUnitaire).toBe(3);
      expect(ligne.devise).toBe("USD");
      expect(stockService.decrementerStock).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ produitId: "p1", type: "SORTIE_VENTE", quantite: 2 }),
        expect.objectContaining({ nom: "Bière" })
      );
      expect(prisma.mouvementStock.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ produitId: "p1", type: "SORTIE_VENTE", quantite: 2 }) })
      );
    });

    it("ne crée ni ligne ni mouvement si le stock est insuffisant", async () => {
      prisma.compteCafeteria.findUnique.mockResolvedValue(compteOuvert);
      prisma.produit.findUnique.mockResolvedValue({ id: "p1", nom: "Bière", actif: true, prix: 3, devise: "USD" });
      stockService.decrementerStock.mockRejectedValue(new ConflictException("Stock insuffisant"));

      await expect(
        service.ajouterLigne("c1", { sousCompteId: "sc1", produitId: "p1", quantite: 2 } as any, currentUser)
      ).rejects.toThrow(ConflictException);
      expect(prisma.ligneCommande.create).not.toHaveBeenCalled();
      expect(prisma.mouvementStock.create).not.toHaveBeenCalled();
    });
  });

  describe("encaisser", () => {
    function compteAvecLignes(lignesParSousCompte: Array<Array<{ devise: string; prixUnitaire: number; quantite: number }>>) {
      return {
        id: "c1",
        statut: "OUVERT",
        tableOuNom: "Table 4",
        sousComptes: lignesParSousCompte.map((lignes, i) => ({ id: `sc${i}`, lignes })),
      };
    }

    it("refuse d'encaisser un compte sans aucune ligne", async () => {
      prisma.compteCafeteria.findUnique.mockResolvedValue(compteAvecLignes([[]]));
      await expect(
        service.encaisser("c1", { mode: "GROUPE", modePaiement: "CASH" } as any, currentUser)
      ).rejects.toThrow(BadRequestException);
    });

    it("exige reservationLieeId pour un règlement FACTURE_CHAMBRE", async () => {
      prisma.compteCafeteria.findUnique.mockResolvedValue(
        compteAvecLignes([[{ devise: "USD", prixUnitaire: 3, quantite: 2 }]])
      );
      await expect(
        service.encaisser("c1", { mode: "GROUPE", modePaiement: "FACTURE_CHAMBRE" } as any, currentUser)
      ).rejects.toThrow(BadRequestException);
    });

    it("GROUPE : additionne toutes les lignes de tous les sous-comptes par devise", async () => {
      prisma.compteCafeteria.findUnique.mockResolvedValue(
        compteAvecLignes([
          [{ devise: "USD", prixUnitaire: 3, quantite: 2 }], // 6 $
          [{ devise: "USD", prixUnitaire: 5, quantite: 1 }], // 5 $
        ])
      );
      prisma.venteCafeteria.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const [vente] = await service.encaisser("c1", { mode: "GROUPE", modePaiement: "CASH" } as any, currentUser);

      expect(vente.montantTotalUSD).toBe(11);
      expect(vente.montantTotalCDF).toBe(0);
      expect(vente.createdBy).toBe("u1");
      expect(prisma.compteCafeteria.updateMany).toHaveBeenCalledWith({
        where: { id: "c1", hotelId: HOTEL_ID, statut: "OUVERT" },
        data: expect.objectContaining({ statut: "FERME" }),
      });
    });

    it("refuse l'encaissement si le compte a déjà été fermé entre-temps (compare-and-swap)", async () => {
      prisma.compteCafeteria.findUnique.mockResolvedValue(
        compteAvecLignes([[{ devise: "USD", prixUnitaire: 3, quantite: 1 }]])
      );
      prisma.compteCafeteria.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.encaisser("c1", { mode: "GROUPE", modePaiement: "CASH" } as any, currentUser)
      ).rejects.toThrow(ConflictException);
    });

    it("GROUPE : refuse un paiement croisé sur un compte mixte USD/CDF", async () => {
      prisma.compteCafeteria.findUnique.mockResolvedValue(
        compteAvecLignes([
          [
            { devise: "USD", prixUnitaire: 3, quantite: 1 },
            { devise: "CDF", prixUnitaire: 5000, quantite: 1 },
          ],
        ])
      );
      await expect(
        service.encaisser(
          "c1",
          { mode: "GROUPE", modePaiement: "CASH", deviseRegleeParClient: "USD", montantRegleParClient: 10 } as any,
          currentUser
        )
      ).rejects.toThrow(BadRequestException);
    });

    it("refuse le paiement croisé pour PAR_SOUS_COMPTE ou PARTAGE_EGAL", async () => {
      prisma.compteCafeteria.findUnique.mockResolvedValue(
        compteAvecLignes([[{ devise: "USD", prixUnitaire: 3, quantite: 1 }]])
      );
      await expect(
        service.encaisser(
          "c1",
          {
            mode: "PAR_SOUS_COMPTE",
            modePaiement: "CASH",
            deviseRegleeParClient: "CDF",
            montantRegleParClient: 10000,
          } as any,
          currentUser
        )
      ).rejects.toThrow(BadRequestException);
    });

    it("PAR_SOUS_COMPTE : crée une vente par sous-compte ayant des lignes", async () => {
      prisma.compteCafeteria.findUnique.mockResolvedValue(
        compteAvecLignes([
          [{ devise: "USD", prixUnitaire: 3, quantite: 2 }], // 6 $
          [], // sous-compte vide, ne doit générer aucune vente
          [{ devise: "USD", prixUnitaire: 4, quantite: 1 }], // 4 $
        ])
      );
      prisma.venteCafeteria.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const ventes = await service.encaisser(
        "c1",
        { mode: "PAR_SOUS_COMPTE", modePaiement: "CASH" } as any,
        currentUser
      );

      expect(ventes).toHaveLength(2);
      expect(ventes.map((v: any) => v.montantTotalUSD)).toEqual([6, 4]);
    });

    it("PARTAGE_EGAL : répartit le total en N parts qui se recomposent exactement", async () => {
      prisma.compteCafeteria.findUnique.mockResolvedValue(
        compteAvecLignes([[{ devise: "USD", prixUnitaire: 10, quantite: 1 }]]) // 10 $
      );
      prisma.venteCafeteria.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const ventes = await service.encaisser(
        "c1",
        { mode: "PARTAGE_EGAL", modePaiement: "CASH", nombrePersonnes: 3 } as any,
        currentUser
      );

      expect(ventes).toHaveLength(3);
      const total = ventes.reduce((s: number, v: any) => s + v.montantTotalUSD, 0);
      expect(total).toBeCloseTo(10, 2);
    });

    it("PARTAGE_EGAL numérote chaque vente en se basant sur le dernier numéro réel, pas un compte de lignes", async () => {
      // Régression : simule une séquence déjà trouée (0001, 0003 existent, 0002
      // n'existe plus) — un COUNT() de lignes (2) aurait produit "0003" en
      // premier, entrant en collision avec la vente existante. Le mock de
      // findFirst évolue à chaque création pour simuler le "voit ses propres
      // écritures" d'une vraie transaction Postgres.
      let dernier = "CAF-20260101-0003";
      prisma.venteCafeteria.findFirst.mockImplementation(() => Promise.resolve({ numeroRecu: dernier }));
      prisma.venteCafeteria.create.mockImplementation(({ data }: any) => {
        dernier = data.numeroRecu;
        return Promise.resolve(data);
      });
      prisma.compteCafeteria.findUnique.mockResolvedValue(
        compteAvecLignes([[{ devise: "USD", prixUnitaire: 9, quantite: 1 }]])
      );

      const ventes = await service.encaisser(
        "c1",
        { mode: "PARTAGE_EGAL", modePaiement: "CASH", nombrePersonnes: 3 } as any,
        currentUser
      );

      expect(ventes.map((v: any) => v.numeroRecu.slice(-4))).toEqual(["0004", "0005", "0006"]);
    });

    it("PARTAGE_EGAL sans nombrePersonnes est refusé", async () => {
      prisma.compteCafeteria.findUnique.mockResolvedValue(
        compteAvecLignes([[{ devise: "USD", prixUnitaire: 10, quantite: 1 }]])
      );
      await expect(
        service.encaisser("c1", { mode: "PARTAGE_EGAL", modePaiement: "CASH" } as any, currentUser)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("annulerVente", () => {
    it("refuse d'annuler une vente déjà annulée", async () => {
      prisma.venteCafeteria.findUnique.mockResolvedValue({ id: "v1", annuleLe: new Date() });
      await expect(service.annulerVente("v1", "erreur", HOTEL_ID)).rejects.toThrow(ConflictException);
    });
  });
});
