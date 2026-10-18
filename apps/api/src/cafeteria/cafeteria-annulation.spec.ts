import { ConflictException } from "@nestjs/common";
import { MESSAGE_COMPTE_ANNULE, MESSAGE_COMPTE_DEJA_ENCAISSE, MESSAGE_COMPTE_DEJA_FERME } from "@hotel-chicago/regles";
import { CafeteriaService } from "./cafeteria.service";

/** Annulation d'un compte cafétaria créé par erreur (19/10/2026). */
describe("CafeteriaService.annulerCompte", () => {
  const HOTEL_ID = "hotel-1";
  const caissiere = { userId: "u-caisse", supabaseAuthId: "a1", role: "CAFETARIA", nom: "Grace", hotelId: HOTEL_ID } as any;
  const patron = { ...caissiere, userId: "u-patron", role: "PATRON", nom: "Patron" };

  const biere = { id: "p-biere", nom: "Primus", typeProduit: "ARTICLE", portionsDisponibles: null };
  const brochette = { id: "p-broch", nom: "Brochettes", typeProduit: "PLAT", portionsDisponibles: 8 };
  const omelette = { id: "p-omel", nom: "Omelette", typeProduit: "PLAT", portionsDisponibles: null };

  function compte(extra: Record<string, unknown> = {}) {
    return {
      id: "c1",
      hotelId: HOTEL_ID,
      tableOuNom: "Table 4",
      statut: "OUVERT",
      ventes: [],
      sousComptes: [
        {
          id: "sc1",
          payeLe: null,
          lignes: [
            { produitId: biere.id, quantite: "2", produit: biere },
            { produitId: brochette.id, quantite: "1", produit: brochette },
          ],
        },
        { id: "sc2", payeLe: null, lignes: [{ produitId: biere.id, quantite: "1", produit: biere }, { produitId: omelette.id, quantite: "1", produit: omelette }] },
      ],
      ...extra,
    };
  }

  function monter(c: unknown) {
    const prisma: any = {
      compteCafeteria: {
        findUnique: jest.fn().mockResolvedValue(c),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "c1", statut: "ANNULE", syncVersion: 2 }),
      },
      produit: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
    const stockService = { remettreEnStock: jest.fn().mockResolvedValue(undefined) };
    const notifications = { emettre: jest.fn().mockResolvedValue(undefined) };
    const service = new CafeteriaService(prisma, stockService as any, notifications as any);
    return { service, prisma, stockService, notifications };
  }

  it("compte avec consommations non payées : ANNULE, articles en stock, portions rendues, plat sans portions ignoré, patron prévenu", async () => {
    const { service, prisma, stockService, notifications } = monter(compte());
    const r = await service.annulerCompte("c1", caissiere, "  Erreur de table  ");

    const maj = prisma.compteCafeteria.updateMany.mock.calls[0][0];
    expect(maj.where).toEqual({ id: "c1", hotelId: HOTEL_ID, statut: "OUVERT" }); // compare-and-swap
    expect(maj.data).toMatchObject({ statut: "ANNULE", annulePar: "u-caisse", motifAnnulation: "Erreur de table" });
    // 3 bières (2 + 1) remises en stock en UN mouvement.
    expect(stockService.remettreEnStock).toHaveBeenCalledTimes(1);
    expect(stockService.remettreEnStock.mock.calls[0][1]).toMatchObject({ produitId: "p-biere", quantite: 3, motif: "Annulation du compte « Table 4 »" });
    // Brochettes : une portion rendue ; omelette (portions illimitées) : rien.
    expect(prisma.produit.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.produit.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "p-broch" }, data: { portionsDisponibles: { increment: 1 } } });
    expect(r.articlesRemisEnStock).toEqual(expect.arrayContaining([{ nom: "Primus", quantite: 3 }, { nom: "Brochettes", quantite: 1 }]));
    expect(notifications.emettre.mock.calls[0][0]).toMatchObject({ roles: ["PATRON"], type: "COMPTE_CAFETERIA_ANNULE" });
  });

  it("compte vide : annulé sans toucher au stock ; le patron qui annule lui-même n'est pas notifié", async () => {
    const { service, stockService, notifications } = monter(compte({ sousComptes: [{ id: "sc1", payeLe: null, lignes: [] }] }));
    await service.annulerCompte("c1", patron);
    expect(stockService.remettreEnStock).not.toHaveBeenCalled();
    expect(notifications.emettre).not.toHaveBeenCalled();
  });

  it("refusé si une part est déjà payée ou si un reçu valide existe : il faut annuler le reçu", async () => {
    for (const c of [
      compte({ sousComptes: [{ id: "sc1", payeLe: new Date(), lignes: [] }] }),
      compte({ ventes: [{ id: "v1", annuleLe: null }] }),
    ]) {
      const { service, prisma } = monter(c);
      await expect(service.annulerCompte("c1", caissiere)).rejects.toThrow(MESSAGE_COMPTE_DEJA_ENCAISSE);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
  });

  it("un reçu déjà annulé n'empêche pas d'annuler le compte", async () => {
    const { service, prisma } = monter(compte({ ventes: [{ id: "v1", annuleLe: new Date() }] }));
    await service.annulerCompte("c1", caissiere);
    expect(prisma.compteCafeteria.updateMany).toHaveBeenCalled();
  });

  it("refusé pour un compte fermé ou déjà annulé", async () => {
    await expect(monter(compte({ statut: "FERME" })).service.annulerCompte("c1", caissiere)).rejects.toThrow(MESSAGE_COMPTE_DEJA_FERME);
    await expect(monter(compte({ statut: "ANNULE" })).service.annulerCompte("c1", caissiere)).rejects.toThrow(MESSAGE_COMPTE_ANNULE);
  });

  it("deux annulations simultanées : la seconde est refusée et ne rend PAS le stock une deuxième fois", async () => {
    const { service, prisma, stockService } = monter(compte());
    prisma.compteCafeteria.updateMany.mockResolvedValue({ count: 0 }); // l'autre poste a déjà annulé
    await expect(service.annulerCompte("c1", caissiere)).rejects.toBeInstanceOf(ConflictException);
    expect(stockService.remettreEnStock).not.toHaveBeenCalled();
  });
});
