import { BadRequestException } from "@nestjs/common";
import { invaliderCatalogue } from "../common/abonnement/catalogue";
import { AbonnementService } from "./abonnement.service";

const JOUR = 86_400_000;
const PATRON = { userId: "u1", hotelId: "h1", role: "PATRON", nom: "Patron" } as any;

/** Un hôtel, éventuellement avec une licence en cours, et le strict nécessaire de Prisma pour payer les frais de maintenance. */
function monter(opts: { licence: boolean; derniereMaintenance?: Date; fraisHotel?: number | null }) {
  const maintenant = Date.now();
  const hotel: any = { id: "h1", nom: "Hôtel Test", statutLicence: "ACTIF", suspensionManuelle: false, formule: null, createdAt: new Date(maintenant - 200 * JOUR), joursEssai: null };
  const licences = opts.licence
    ? [
        {
          id: "l1",
          annees: 2,
          debutLe: new Date(maintenant - 10 * JOUR),
          finLe: new Date(maintenant + 700 * JOUR),
          fraisMaintenanceUsd: opts.fraisHotel === undefined ? null : opts.fraisHotel,
          paiementsMaintenance: opts.derniereMaintenance ? [{ periodeCouverteJusquau: opts.derniereMaintenance }] : [],
        },
      ]
    : [];
  const hotelComplet = () => ({ ...hotel, paiementsLicence: opts.licence ? [{ periodeCouverteJusquau: new Date(maintenant + 700 * JOUR) }] : [], licences });
  const lignes: any[] = [];
  const maintenances: any[] = [];
  const prisma: any = {
    lignes,
    maintenances,
    hotel: { findUnique: jest.fn(async () => hotelComplet()), findUniqueOrThrow: jest.fn(async () => hotelComplet()), update: jest.fn(async ({ data }: any) => Object.assign(hotel, data)) },
    chambre: { count: jest.fn(async () => 5) },
    formuleAbonnement: { findMany: jest.fn(async () => []) },
    parametresPlateforme: { findUnique: jest.fn(async () => null) },
    paiementAbonnement: {
      findUnique: jest.fn(async ({ where }: any) => lignes.find((l) => l.id === where.id || l.cleIdempotence === where.cleIdempotence) ?? null),
      findFirst: jest.fn(async () => null),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => ({ ...lignes.find((l) => l.id === where.id), paiementLicence: null, paiementMaintenance: maintenances[0] ?? null })),
      create: jest.fn(async ({ data }: any) => {
        const l = { id: `a${lignes.length + 1}`, statut: "EN_ATTENTE", createdAt: new Date(), objet: "ABONNEMENT", ...data };
        lignes.push(l);
        return l;
      }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(lignes.find((l) => l.id === where.id), data)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const l = lignes.find((x) => x.id === where.id && where.statut.in.includes(x.statut));
        if (!l) return { count: 0 };
        Object.assign(l, data);
        return { count: 1 };
      }),
    },
    paiementMaintenance: {
      create: jest.fn(async ({ data }: any) => {
        const m = { id: `m${maintenances.length + 1}`, ...data };
        maintenances.push(m);
        return m;
      }),
    },
    paiementLicence: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const linkpay: any = {
    estConfigure: () => true,
    marchandPlateforme: () => null,
    creerDemande: jest.fn(async () => ({ reference: "REF1", linkToken: "T", frais: null })),
    lancerPaiement: jest.fn(async () => ({ referenceFournisseur: "PSP1" })),
    lireStatut: jest.fn(),
  };
  const notifications: any = { emettre: jest.fn() };
  return { service: new AbonnementService(prisma, linkpay, notifications), prisma, linkpay, notifications, hotel };
}

const demande = (over: object = {}) => ({ objet: "MAINTENANCE", mois: 1, devise: "USD", operateur: "VODACOM", telephone: "0828497218", cleIdempotence: "11111111-1111-4111-8111-111111111111", ...over }) as any;

describe("Frais de maintenance payés dans l'application (hôtel avec licence)", () => {
  beforeEach(() => invaliderCatalogue());

  it("le montant vient du serveur : 5 $ par mois par défaut, multiplié par la durée, en francs au taux de la plateforme", async () => {
    const { service, prisma, linkpay } = monter({ licence: true });
    const v = await service.creerPaiement(PATRON, demande({ mois: 3 }));
    expect(prisma.lignes[0]).toMatchObject({ objet: "MAINTENANCE", formule: "MAINTENANCE", mois: 3, montant: 15, devise: "USD", hotelId: "h1" });
    expect(v.objet).toBe("MAINTENANCE");
    expect(linkpay.creerDemande).toHaveBeenCalledWith(expect.objectContaining({ montantCentimes: 1500, devise: "USD", description: expect.stringContaining("Maintenance HotelSaver") }));

    const cdf = monter({ licence: true });
    await cdf.service.creerPaiement(PATRON, demande({ devise: "CDF", cleIdempotence: "22222222-2222-4222-8222-222222222222" }));
    expect(cdf.prisma.lignes[0].montant).toBe(14000); // 5 $ × 2 800 FC
  });

  it("frais propres à l'hôtel : ils remplacent le réglage de la plateforme", async () => {
    const { service, prisma } = monter({ licence: true, fraisHotel: 8 });
    await service.creerPaiement(PATRON, demande({ mois: 3 }));
    expect(prisma.lignes[0].montant).toBe(24);
  });

  it("durées permises : 1, 3, 6 ou 12 mois seulement", async () => {
    const { service } = monter({ licence: true });
    await expect(service.creerPaiement(PATRON, demande({ mois: 2 }))).rejects.toThrow(BadRequestException);
  });

  it("sans licence en cours : pas de maintenance ; avec licence : pas d'abonnement (la licence le remplace)", async () => {
    await expect(monter({ licence: false }).service.creerPaiement(PATRON, demande())).rejects.toThrow("pas de licence en cours");
    await expect(monter({ licence: true }).service.creerPaiement(PATRON, demande({ objet: "ABONNEMENT", formule: "PRO" }))).rejects.toThrow("licence");
  });

  it("aperçu : le prix de la maintenance, ou un refus sans licence", async () => {
    const a = await monter({ licence: true }).service.apercu(PATRON, undefined, 6, "USD", "MAINTENANCE");
    expect(a).toMatchObject({ devise: "USD", montant: 30, commission: 0, total: 30 });
    await expect(monter({ licence: false }).service.apercu(PATRON, undefined, 1, "USD", "MAINTENANCE")).rejects.toThrow(BadRequestException);
  });

  it("paiement confirmé par ScanLinkPay : la maintenance repart de l'échéance (jours gardés), une seule fois même si on rapproche deux fois", async () => {
    const echeance = new Date(Date.now() + 3 * JOUR);
    const { service, prisma, linkpay, notifications, hotel } = monter({ licence: true, derniereMaintenance: echeance });
    await service.creerPaiement(PATRON, demande({ mois: 1 }));
    prisma.lignes[0].referenceFournisseur = "PSP1";
    linkpay.lireStatut.mockResolvedValue({ statut: "SUCCESS", montantCentimes: 500, devise: "USD" });

    await service.rapprocher(prisma.lignes[0].id);
    await service.rapprocher(prisma.lignes[0].id);

    expect(prisma.maintenances).toHaveLength(1);
    expect(prisma.maintenances[0]).toMatchObject({ hotelId: "h1", licenceId: "l1", mois: 1, montant: 5, methode: "MOBILE_MONEY" });
    expect(prisma.maintenances[0].periodeCouverteJusquau.getTime()).toBe(echeance.getTime() + 30 * JOUR);
    expect(prisma.lignes[0]).toMatchObject({ statut: "REUSSI", paiementMaintenanceId: "m1" });
    expect(hotel.statutLicence).toBe("ACTIF");
    expect(prisma.paiementLicence.create).not.toHaveBeenCalled(); // pas d'abonnement crédité
    expect(notifications.emettre).toHaveBeenCalledTimes(1);
    expect(notifications.emettre.mock.calls[0][0]).toMatchObject({ titre: "Maintenance payée" });
  });

  it("maintenance impayée depuis longtemps, hôtel suspendu : le paiement repart de maintenant et rouvre l'accès", async () => {
    const { service, prisma, linkpay, hotel } = monter({ licence: true, derniereMaintenance: new Date(Date.now() - 20 * JOUR) });
    hotel.statutLicence = "SUSPENDU";
    await service.creerPaiement(PATRON, demande());
    prisma.lignes[0].referenceFournisseur = "PSP1";
    linkpay.lireStatut.mockResolvedValue({ statut: "SUCCESS", montantCentimes: 500, devise: "USD" });
    await service.rapprocher(prisma.lignes[0].id);
    const fin = prisma.maintenances[0].periodeCouverteJusquau.getTime();
    expect(Math.abs(fin - (Date.now() + 30 * JOUR))).toBeLessThan(5000);
    expect(hotel.statutLicence).toBe("ACTIF");
  });

  it("un montant reçu qui ne correspond pas n'est jamais crédité", async () => {
    const { service, prisma, linkpay } = monter({ licence: true });
    await service.creerPaiement(PATRON, demande());
    prisma.lignes[0].referenceFournisseur = "PSP1";
    linkpay.lireStatut.mockResolvedValue({ statut: "SUCCESS", montantCentimes: 100, devise: "USD" });
    await service.rapprocher(prisma.lignes[0].id);
    expect(prisma.maintenances).toHaveLength(0);
    expect(prisma.lignes[0].statut).toBe("ECHEC");
  });
});
