import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { invaliderCatalogue } from "../common/abonnement/catalogue";
import { LicencesAdminService } from "./licences-admin.service";

const JOUR = 86_400_000;

/** Un faux Prisma en mémoire, juste ce qu'utilise le service des licences. */
function creerPrisma(opts: { licences?: any[]; maintenances?: any[]; hotel?: any } = {}) {
  const licences: any[] = opts.licences ?? [];
  const maintenances: any[] = opts.maintenances ?? [];
  const paiementsLicence: any[] = [];
  const hotel: any = { id: "h1", nom: "Hôtel Test", statutLicence: "ESSAI", suspensionManuelle: false, formule: "PRO", createdAt: new Date(Date.now() - 100 * JOUR), joursEssai: null, ...opts.hotel };
  const prisma: any = {
    licences,
    maintenances,
    paiementsLicence,
    hotel: {
      findUnique: jest.fn(async () => ({ id: hotel.id, nom: hotel.nom })),
      findUniqueOrThrow: jest.fn(async () => ({
        ...hotel,
        paiementsLicence: paiementsLicence.filter((p) => !p.annuleLe).slice(-1),
        licences: licences
          .filter((l) => !l.annuleLe && l.debutLe <= new Date() && l.finLe >= new Date())
          .map((l) => ({ ...l, paiementsMaintenance: maintenances.filter((m) => m.licenceId === l.id && !m.annuleLe).slice(-1) })),
      })),
      update: jest.fn(async ({ data }: any) => Object.assign(hotel, data)),
    },
    licenceHotel: {
      findFirst: jest.fn(async ({ where }: any) => licences.find((l) => (where.id ? l.id === where.id : !l.annuleLe && l.finLe > where.finLe.gt)) ?? null),
      findMany: jest.fn(async () => licences),
      create: jest.fn(async ({ data }: any) => {
        const l = { id: `l${licences.length + 1}`, createdAt: new Date(), annuleLe: null, motifAnnulation: null, ...data };
        licences.push(l);
        return l;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const l = licences.find((x) => x.id === where.id && (where.annuleLe === null ? !x.annuleLe : true));
        if (!l) return { count: 0 };
        Object.assign(l, data);
        return { count: 1 };
      }),
    },
    paiementLicence: {
      create: jest.fn(async ({ data }: any) => {
        const p = { id: `pl${paiementsLicence.length + 1}`, annuleLe: null, ...data };
        paiementsLicence.push(p);
        return p;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const p = paiementsLicence.find((x) => x.id === where.id);
        if (p) Object.assign(p, data);
        return { count: p ? 1 : 0 };
      }),
    },
    paiementMaintenance: {
      findMany: jest.fn(async () => maintenances.map((m) => ({ ...m, paiementAbonnement: m.enLigne ? { id: "pa" } : null }))),
      findFirst: jest.fn(async ({ where }: any) => {
        const m = maintenances.find((x) => x.id === where.id);
        return m ? { ...m, paiementAbonnement: m.enLigne ? { id: "pa" } : null } : null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const m = { id: `m${maintenances.length + 1}`, createdAt: new Date(), annuleLe: null, ...data };
        maintenances.push(m);
        return m;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const m = maintenances.find((x) => x.id === where.id && !x.annuleLe);
        if (!m) return { count: 0 };
        Object.assign(m, data);
        return { count: 1 };
      }),
    },
    superAdmin: { findMany: jest.fn(async () => [{ id: "sa-1", nom: "Admin" }]) },
    formuleAbonnement: { findMany: jest.fn(async () => []) },
    parametresPlateforme: { findUnique: jest.fn(async () => null) },
  };
  prisma.$transaction = jest.fn(async (arg: any) => (typeof arg === "function" ? arg(prisma) : Promise.all(arg)));
  return { prisma, hotel };
}

describe("Licences activées à la main par le super-admin", () => {
  beforeEach(() => invaliderCatalogue());

  it("active une licence de 2 ans : toutes les fonctions (plus de formule), actif, et une ligne de paiement qui court jusqu'à la fin", async () => {
    const { prisma, hotel } = creerPrisma();
    const r = await new LicencesAdminService(prisma).activer("h1", { annees: 2, montant: 600, devise: "USD", note: "Reçu en main propre" } as any, "sa-1");

    expect(prisma.licences).toHaveLength(1);
    const l = prisma.licences[0];
    expect(l.annees).toBe(2);
    expect(l.finLe.getUTCFullYear() - l.debutLe.getUTCFullYear()).toBe(2);
    expect(prisma.paiementsLicence[0]).toMatchObject({ montant: 600, devise: "USD", methode: "ESPECES", periodeCouverteJusquau: l.finLe, enregistreParSuperAdminId: "sa-1" });
    expect(l.paiementLicenceId).toBe(prisma.paiementsLicence[0].id);
    expect(hotel).toMatchObject({ statutLicence: "ACTIF", formule: null, suspensionManuelle: false });
    // Premier mois de maintenance compris : première échéance 30 jours après l'activation, le patron n'a rien à payer tout de suite.
    expect(r.etat).toMatchObject({ statut: "ACTIF", bloque: false, joursRestants: 30 });
    expect(r.etat.licence).toMatchObject({ annees: 2, fraisMaintenanceUsd: 5 });
  });

  it("des frais de maintenance propres à l'hôtel remplacent le réglage de la plateforme (5 $)", async () => {
    const { prisma } = creerPrisma();
    const r = await new LicencesAdminService(prisma).activer("h1", { annees: 1, fraisMaintenanceUsd: 8 } as any, "sa-1");
    expect(r.etat.licence?.fraisMaintenanceUsd).toBe(8);
    expect(r.fraisMaintenanceParDefautUsd).toBe(5);
  });

  it("acheter une nouvelle licence alors qu'une court encore : la nouvelle commence à la fin de l'ancienne", async () => {
    const fin = new Date(Date.now() + 100 * JOUR);
    const { prisma } = creerPrisma({ licences: [{ id: "l0", annees: 1, debutLe: new Date(Date.now() - 265 * JOUR), finLe: fin, annuleLe: null }] });
    await new LicencesAdminService(prisma).activer("h1", { annees: 1 } as any, "sa-1");
    expect(prisma.licences[1].debutLe.toISOString()).toBe(fin.toISOString());
  });

  it("annuler la licence : elle et son paiement sont marqués annulés (jamais effacés) et l'hôtel retombe sur son état normal", async () => {
    const { prisma, hotel } = creerPrisma({ hotel: { createdAt: new Date(Date.now() - 100 * JOUR) } });
    const s = new LicencesAdminService(prisma);
    await s.activer("h1", { annees: 1 } as any, "sa-1");
    await s.annuler("h1", "l1", "  Argent non reçu  ", "sa-1");
    expect(prisma.licences[0]).toMatchObject({ motifAnnulation: "Argent non reçu", annuleParSuperAdminId: "sa-1" });
    expect(prisma.licences[0].annuleLe).toBeInstanceOf(Date);
    expect(prisma.paiementsLicence[0].annuleLe).toBeInstanceOf(Date);
    expect(hotel.statutLicence).toBe("SUSPENDU"); // essai terminé depuis longtemps, plus rien de payé
    await expect(s.annuler("h1", "l1", "Encore", "sa-1")).rejects.toThrow(ConflictException);
    await expect(s.annuler("h1", "inconnue", "Erreur", "sa-1")).rejects.toThrow(NotFoundException);
  });

  it("maintenance reçue à la main : prolonge de 30 jours par mois, réactive l'hôtel ; refusée sans licence en cours", async () => {
    const { prisma, hotel } = creerPrisma();
    const s = new LicencesAdminService(prisma);
    await expect(s.enregistrerMaintenance("h1", { mois: 1, montant: 5, devise: "USD", methode: "ESPECES" } as any, "sa-1")).rejects.toThrow(BadRequestException);

    await s.activer("h1", { annees: 1 } as any, "sa-1");
    hotel.statutLicence = "SUSPENDU";
    const debut = prisma.licences[0].debutLe.getTime();
    const r = await s.enregistrerMaintenance("h1", { mois: 3, montant: 15, devise: "USD", methode: "ESPECES", note: "Reçu" } as any, "sa-1");
    // première échéance (début + 30 j) puis 3 × 30 jours de plus
    expect(prisma.maintenances[0].periodeCouverteJusquau.getTime()).toBeGreaterThanOrEqual(debut + 120 * JOUR - 1000);
    expect(prisma.maintenances[0].periodeCouverteJusquau.getTime()).toBeLessThanOrEqual(debut + 120 * JOUR + 1000);
    expect(prisma.maintenances[0]).toMatchObject({ licenceId: "l1", mois: 3, montant: 15, enregistreParSuperAdminId: "sa-1" });
    expect(hotel.statutLicence).toBe("ACTIF");
    expect(r.maintenances[0]).toMatchObject({ source: "MANUEL", mois: 3 });
  });

  it("annuler une maintenance saisie à la main : tracée ; un paiement en ligne réellement reçu ne s'annule pas ici", async () => {
    const { prisma } = creerPrisma();
    const s = new LicencesAdminService(prisma);
    await s.activer("h1", { annees: 1 } as any, "sa-1");
    await s.enregistrerMaintenance("h1", { mois: 1, montant: 5, devise: "USD", methode: "ESPECES" } as any, "sa-1");
    await s.annulerMaintenance("h1", "m1", "Montant faux", "sa-1");
    expect(prisma.maintenances[0]).toMatchObject({ motifAnnulation: "Montant faux" });
    await expect(s.annulerMaintenance("h1", "m1", "Encore", "sa-1")).rejects.toThrow(ConflictException);
    prisma.maintenances.push({ id: "m9", hotelId: "h1", enLigne: true, annuleLe: null });
    await expect(s.annulerMaintenance("h1", "m9", "Erreur", "sa-1")).rejects.toThrow(BadRequestException);
  });
});
