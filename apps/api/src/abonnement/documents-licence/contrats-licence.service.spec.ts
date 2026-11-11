import { ConflictException, BadRequestException, NotFoundException } from "@nestjs/common";
import { invaliderCatalogue } from "../../common/abonnement/catalogue";
import { ContratsLicenceService, codeControle, empreinteSha256, typeDuFichier } from "./contrats-licence.service";

const PDF = Buffer.from("%PDF-1.4\n%contrat signé\n");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

function creer(surcharges: Record<string, unknown> = {}) {
  const licence: any = {
    id: "00000000-0000-4000-8000-000000000001",
    hotelId: "00000000-0000-4000-8000-0000000000aa",
    annees: 2,
    debutLe: new Date("2026-11-11T08:00:00Z"),
    finLe: new Date("2028-11-11T08:00:00Z"),
    montant: 600,
    devise: "USD",
    fraisMaintenanceUsd: null,
    createdAt: new Date("2026-11-11T08:00:00Z"),
    annuleLe: null,
    motifAnnulation: null,
    enregistreParSuperAdminId: "sa-1",
    numero: null,
    contratVersion: null,
    contratTexte: null,
    contratEmpreinte: null,
    accepteLe: null,
    accepteParNom: null,
    accepteIp: null,
    accepteAppareil: null,
    scanChemin: null,
    scanType: null,
    scanTaille: null,
    scanEmpreinte: null,
    scanEnvoyeLe: null,
    paiementLicence: { methode: "ESPECES" },
    ...surcharges,
  };
  const maintenance: any = { id: "00000000-0000-4000-8000-0000000000b1", hotelId: licence.hotelId, licenceId: licence.id, mois: 1, montant: 5, devise: "USD", methode: "MOBILE_MONEY", periodeCouverteJusquau: new Date("2026-12-11T08:00:00Z"), createdAt: new Date("2026-11-20T10:00:00Z"), annuleLe: null, numeroRecu: null, enregistreParSuperAdminId: null, paiementAbonnement: { confirmeLe: new Date("2026-11-20T10:01:00Z"), referenceFournisseur: "pi_123", referenceDemande: "REQ-1" }, licence: { numero: null } };
  let seq = 0;
  const prisma: any = {
    licence,
    maintenance,
    licenceHotel: {
      findUnique: jest.fn(async ({ where }: any) => (where.id === licence.id || where.numero === licence.numero ? { ...licence, hotel: { nom: "Hôtel du Lac" } } : null)),
      findFirst: jest.fn(async ({ where }: any) => (where.id === licence.id && where.hotelId === licence.hotelId ? { ...licence } : where.hotelId === licence.hotelId && !where.id ? { ...licence } : null)),
      findUniqueOrThrow: jest.fn(async () => ({ ...licence })),
      updateMany: jest.fn(async ({ where, data }: any) => {
        for (const [k, v] of Object.entries(where)) if (v === null && licence[k] !== null) return { count: 0 };
        Object.assign(licence, data);
        return { count: 1 };
      }),
      update: jest.fn(async ({ data }: any) => Object.assign(licence, data)),
    },
    hotel: { findUniqueOrThrow: jest.fn(async () => ({ nom: "Hôtel du Lac", adresse: "12 avenue du Lac, Lubumbashi", emailContact: null, telephoneContact: "+243810000000" })), findUnique: jest.fn(async () => ({ nom: "Hôtel du Lac" })) },
    utilisateur: { findFirst: jest.fn(async () => ({ nom: "Marie Patron", telephone: null, email: null })), findUnique: jest.fn(async () => ({ nom: "Marie Patron" })) },
    parametresPlateforme: { findUnique: jest.fn(async () => ({ editeurNom: "HotelSaver SARL", editeurAdresse: "Lubumbashi", editeurRccm: "RCCM-1", editeurNif: "NIF-1", editeurRepresentant: "Jean Test", editeurFonction: "Gérant" })) },
    formuleAbonnement: { findMany: jest.fn(async () => []) },
    superAdmin: { findMany: jest.fn(async () => [{ id: "sa-1", nom: "Admin" }]) },
    paiementMaintenance: {
      findFirst: jest.fn(async () => ({ ...maintenance })),
      findMany: jest.fn(async () => [{ id: maintenance.id }]),
      findUniqueOrThrow: jest.fn(async () => ({ numeroRecu: maintenance.numeroRecu })),
      updateMany: jest.fn(async ({ data }: any) => {
        if (maintenance.numeroRecu) return { count: 0 };
        Object.assign(maintenance, data);
        return { count: 1 };
      }),
    },
    $queryRaw: jest.fn(async () => [{ n: BigInt(++seq) }]),
  };
  const storage: any = { envoyerContrat: jest.fn(async () => undefined), lireContrat: jest.fn(async () => JPEG) };
  return { prisma, storage, service: new ContratsLicenceService(prisma, storage), licence, maintenance };
}

const patron = { userId: "u1", hotelId: "00000000-0000-4000-8000-0000000000aa", role: "PATRON", nom: "Marie Patron", supabaseAuthId: "s1" } as any;

describe("Contrat de licence : fabrication et preuve", () => {
  beforeEach(() => invaliderCatalogue());

  it("fige le numéro, le texte et l'empreinte à la première fois, puis ne les change plus (même si le modèle ou l'hôtel changent)", async () => {
    const { service, prisma, licence } = creer();
    const l = await service.assurerContrat(licence.id);
    expect(l.numero).toMatch(/^LIC-2026-0001$/);
    expect(l.contratTexte).toContain("CONTRAT DE LICENCE ET DE MAINTENANCE N° LIC-2026-0001");
    expect(l.contratTexte).toContain("HotelSaver SARL");
    expect(l.contratEmpreinte).toBe(empreinteSha256(l.contratTexte!));
    const figee = l.contratTexte;
    prisma.hotel.findUniqueOrThrow = jest.fn(async () => ({ nom: "Nom modifié ensuite", adresse: null, emailContact: null, telephoneContact: null }));
    const encore = await service.assurerContrat(licence.id);
    expect(encore.numero).toBe("LIC-2026-0001");
    expect(encore.contratTexte).toBe(figee);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("le patron voit le contrat de sa licence et l'accepte : on garde qui, quand, d'où et avec quel appareil", async () => {
    const { service, licence } = creer();
    const vue = await service.contratPourPatron(patron);
    expect(vue).toMatchObject({ licenceId: licence.id, numero: "LIC-2026-0001", accepteLe: null });
    const apres = await service.accepter(patron, licence.id, vue!.empreinte, "41.1.2.3", "HotelSaver/1.0 Windows");
    expect(apres?.accepteLe).not.toBeNull();
    expect(licence).toMatchObject({ accepteParUtilisateurId: "u1", accepteParNom: "Marie Patron", accepteIp: "41.1.2.3", accepteAppareil: "HotelSaver/1.0 Windows" });
  });

  it("refuse l'acceptation si le texte lu n'est plus le bon, ou si elle a déjà eu lieu, ou si la licence est celle d'un autre hôtel", async () => {
    const { service, licence } = creer();
    const vue = await service.contratPourPatron(patron);
    await expect(service.accepter(patron, licence.id, "0".repeat(64), null, null)).rejects.toBeInstanceOf(ConflictException);
    await service.accepter(patron, licence.id, vue!.empreinte, null, null);
    await expect(service.accepter(patron, licence.id, vue!.empreinte, null, null)).rejects.toThrow("déjà été accepté");
    await expect(service.accepter({ ...patron, hotelId: "autre" }, licence.id, vue!.empreinte, null, null)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("l'exemplaire signé : PDF/JPEG/PNG reconnus d'après le contenu, jamais d'après le nom ; empreinte SHA-256 enregistrée", async () => {
    expect(typeDuFichier(PDF)?.type).toBe("application/pdf");
    expect(typeDuFichier(JPEG)?.type).toBe("image/jpeg");
    expect(typeDuFichier(Buffer.from("MZ exécutable"))).toBeNull();
    const { service, licence, storage } = creer();
    await expect(service.enregistrerScan(licence.hotelId, licence.id, Buffer.from("MZ virus.pdf"), "sa-1")).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.enregistrerScan(licence.hotelId, licence.id, undefined, "sa-1")).rejects.toBeInstanceOf(BadRequestException);
    await service.enregistrerScan(licence.hotelId, licence.id, PDF, "sa-1");
    expect(storage.envoyerContrat).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${licence.hotelId}/${licence.id}/[0-9a-f-]+\\.pdf$`)), PDF, "application/pdf");
    expect(licence).toMatchObject({ scanType: "application/pdf", scanTaille: PDF.length, scanEmpreinte: empreinteSha256(PDF), scanEnvoyeParSuperAdminId: "sa-1" });
  });

  it("vérification publique : le bon numéro + code est authentique, un code faux ou un numéro inconnu ne l'est pas, et rien de sensible n'est révélé", async () => {
    const { service, licence } = creer();
    const l = await service.assurerContrat(licence.id);
    const ok = await service.verifier(l.numero!, codeControle(l.contratEmpreinte!));
    expect(ok).toMatchObject({ authentique: true, numero: "LIC-2026-0001", hotel: "Hôtel du Lac", annees: 2, annulee: false });
    expect(JSON.stringify(ok)).not.toContain("Marie Patron");
    expect((await service.verifier(l.numero!, "AAAAAAAAAAAA")).authentique).toBe(false);
    expect((await service.verifier("LIC-2026-9999", codeControle(l.contratEmpreinte!))).authentique).toBe(false);
    expect(await service.pageVerification(l.numero!, "FAUX")).toContain("Document non reconnu");
    expect(await service.pageVerification(l.numero!, codeControle(l.contratEmpreinte!))).toContain("Document authentique");
  });

  it("produit de vrais PDF : contrat, reçu de licence, reçu de maintenance (numéro stable) et dossier de preuve", async () => {
    const { service, licence, maintenance } = creer({ accepteLe: new Date("2026-11-12T09:00:00Z"), accepteParNom: "Marie Patron", accepteIp: "41.1.2.3", accepteAppareil: "HotelSaver Windows" });
    for (const f of [await service.contratPdf(licence.hotelId, licence.id), await service.recuLicencePdf(licence.hotelId, licence.id)]) {
      expect(f.type).toBe("application/pdf");
      expect(Buffer.from(f.base64, "base64").subarray(0, 5).toString()).toBe("%PDF-");
    }
    const recu1 = await service.recuMaintenancePdf(licence.hotelId, maintenance.id);
    const recu2 = await service.recuMaintenancePdf(licence.hotelId, maintenance.id);
    expect(recu1.nom).toMatch(/^Recu-maintenance-MNT-2026-0000\d\.pdf$/);
    expect(recu2.nom).toBe(recu1.nom);
    await service.enregistrerScan(licence.hotelId, licence.id, JPEG, "sa-1");
    const dossier = await service.dossierPreuvePdf(licence.hotelId, licence.id, "sa-1");
    expect(dossier.nom).toBe("Dossier-de-preuve-LIC-2026-0001.pdf");
    expect(Buffer.from(dossier.base64, "base64").length).toBeGreaterThan(2000);
  });
});
