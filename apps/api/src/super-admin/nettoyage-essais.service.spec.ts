import { NettoyageEssaisService } from "./nettoyage-essais.service";
import { invaliderCatalogue } from "../common/abonnement/catalogue";

/** Nettoyage des essais abandonnés (18/10/2026). */
describe("NettoyageEssaisService", () => {
  const JOUR = 86_400_000;
  const maintenant = new Date("2026-11-01T10:00:00.000Z");

  function monter(hotels: any[]) {
    const prisma: any = {
      hotel: { findMany: jest.fn().mockResolvedValue(hotels), delete: jest.fn() },
      utilisateur: { findMany: jest.fn().mockResolvedValue([{ supabaseAuthId: "auth-1", telephone: "+243828497219" }]), deleteMany: jest.fn() },
      inscriptionRecente: { deleteMany: jest.fn() },
      hotelSupprime: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      essaiUtilise: { upsert: jest.fn() },
      $transaction: jest.fn(),
      // Réglages : la base ne répond pas ici → valeurs de départ (14 j d'essai, 3 j de grâce, suppression 10 j après).
      formuleAbonnement: { findMany: jest.fn().mockResolvedValue([]) },
      parametresPlateforme: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    for (const m of ["remboursement", "paiementReservation", "menuDuJour", "inventairePhysique", "mouvementStock", "ligneCommande", "venteCafeteria", "sousCompte", "compteCafeteria", "facture", "reservation", "client", "chambre", "produit", "tauxChange", "depense", "paiementAbonnement", "paiementLicence"]) {
      prisma[m] = { deleteMany: jest.fn() };
    }
    // Transaction interactive : la fonction reçoit le même faux client.
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
    const supabaseAdmin = { supprimerCompte: jest.fn().mockResolvedValue(undefined) };
    const stockage = { supprimerDossierHotel: jest.fn().mockResolvedValue(3) };
    const notifications = { emettre: jest.fn().mockResolvedValue(undefined) };
    const service = new NettoyageEssaisService(prisma, supabaseAdmin as any, stockage as any, notifications as any);
    return { service, prisma, supabaseAdmin, stockage, notifications };
  }

  beforeEach(() => invaliderCatalogue());

  const hotel = (joursDepuisCreation: number, extra: Record<string, unknown> = {}) => ({
    id: `h-${joursDepuisCreation}`,
    nom: "Hôtel Essai",
    sousDomaine: `essai-${joursDepuisCreation}`,
    createdAt: new Date(maintenant.getTime() - joursDepuisCreation * JOUR),
    statutLicence: "ESSAI",
    suspensionManuelle: false,
    joursEssai: null,
    ...extra,
  });

  it("ne cherche que des hôtels jamais payés, en essai ou suspendus automatiquement (jamais ACTIF ni suspension manuelle)", async () => {
    const { service, prisma } = monter([]);
    await service.candidats();
    const where = prisma.hotel.findMany.mock.calls[0][0].where;
    expect(where.formule).toBeNull();
    expect(where.OR).toEqual([{ statutLicence: "ESSAI" }, { statutLicence: "SUSPENDU", suspensionManuelle: false }]);
    expect(where.paiementsLicence).toEqual({ none: { annuleLe: null } });
    expect(where.paiementsAbonnement).toEqual({ none: { statut: "REUSSI" } });
  });

  it("supprime un essai échu (14 j + 3 j de grâce + 10 j dépassés) : fichiers, base en une transaction, trace, comptes", async () => {
    const { service, prisma, supabaseAdmin, stockage } = monter([hotel(28)]);
    const r = await service.executer(maintenant);
    expect(r.supprimes).toEqual(["essai-28"]);
    expect(stockage.supprimerDossierHotel).toHaveBeenCalledWith("h-28");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.hotel.delete).toHaveBeenCalledWith({ where: { id: "h-28" } });
    expect(prisma.hotelSupprime.create.mock.calls[0][0].data).toMatchObject({ hotelId: "h-28", sousDomaine: "essai-28", motif: "Essai gratuit terminé sans paiement" });
    expect(prisma.essaiUtilise.upsert).toHaveBeenCalledTimes(1); // le numéro garde son « essai utilisé »
    expect(supabaseAdmin.supprimerCompte).toHaveBeenCalledWith("auth-1");
  });

  it("prévient le patron 3 jours puis 1 jour avant, sans rien supprimer", async () => {
    // Créé il y a 24 j → suppression dans 3 j (14 + 3 + 10 = 27).
    const { service, prisma, notifications } = monter([hotel(24)]);
    const r = await service.executer(maintenant);
    expect(r).toEqual({ supprimes: [], prevenus: ["essai-24"] });
    expect(notifications.emettre.mock.calls[0][0]).toMatchObject({ hotelId: "h-24", cleDedup: "suppression-essai:h-24:3", type: "SUPPRESSION_ESSAI_PROCHE" });
    expect(prisma.hotel.delete).not.toHaveBeenCalled();
  });

  it("un essai encore en cours n'est ni prévenu ni supprimé", async () => {
    const { service, prisma, notifications } = monter([hotel(5)]);
    expect(await service.executer(maintenant)).toEqual({ supprimes: [], prevenus: [] });
    expect(notifications.emettre).not.toHaveBeenCalled();
    expect(prisma.hotel.delete).not.toHaveBeenCalled();
  });

  it("si le stockage refuse, rien n'est effacé en base (pas de données à moitié supprimées)", async () => {
    const { service, prisma, stockage } = monter([hotel(40)]);
    stockage.supprimerDossierHotel.mockRejectedValue(new Error("stockage indisponible"));
    const r = await service.executer(maintenant);
    expect(r.supprimes).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("purge les traces d'inscription de plus de 24 h", async () => {
    const { service, prisma } = monter([]);
    await service.executer(maintenant);
    expect(prisma.inscriptionRecente.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date(maintenant.getTime() - JOUR) } } });
  });
});
