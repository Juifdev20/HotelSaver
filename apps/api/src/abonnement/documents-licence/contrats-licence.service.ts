import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import type { PrismaClient } from "@hotel-chicago/database";
import { CONTRAT_LICENCE_VERSION, genererContratLicence } from "@hotel-chicago/regles";
import type { ContratLicenceVue, UtilisateurAuthentifie, VerificationLicenceVue } from "@hotel-chicago/types";
import { PRISMA } from "../../prisma/prisma.module";
import { SupabaseStorageService } from "../../common/supabase-storage/supabase-storage.service";
import { lireCatalogue } from "../../common/abonnement/catalogue";
import { editeurPourContrat, lireEditeur } from "../../common/abonnement/editeur";
import { type DonneesLicencePdf, type DonneesMaintenancePdf, pdfContrat, pdfDossierPreuve, pdfRecuLicence, pdfRecuMaintenance } from "./pdf-licence";

export interface FichierPdf {
  nom: string;
  type: string;
  /** Contenu en base64 : la réponse reste du JSON, comme toutes les autres routes. */
  base64: string;
}

/** Taille maximale d'un exemplaire signé numérisé. */
export const TAILLE_MAX_SCAN = 8 * 1024 * 1024;

export const empreinteSha256 = (contenu: string | Buffer) => createHash("sha256").update(contenu).digest("hex");
/** Code de contrôle court (12 premiers caractères de l'empreinte du contrat) : imprimé sur les documents, demandé par la page de vérification. */
export const codeControle = (empreinte: string) => empreinte.slice(0, 12).toUpperCase();

/** Type réel d'un fichier d'après ses premiers octets (on ne croit jamais le type annoncé par le client). */
export function typeDuFichier(contenu: Buffer): { type: string; extension: string } | null {
  if (contenu.length > 4 && contenu.subarray(0, 4).toString("latin1") === "%PDF") return { type: "application/pdf", extension: "pdf" };
  if (contenu.length > 3 && contenu[0] === 0xff && contenu[1] === 0xd8 && contenu[2] === 0xff) return { type: "image/jpeg", extension: "jpg" };
  if (contenu.length > 8 && contenu.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: "image/png", extension: "png" };
  return null;
}

const echapper = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/**
 * Preuve d'achat des licences (11/11/2026) : contrat figé à l'activation, acceptation du patron dans l'application, exemplaire papier signé,
 * reçus numérotés et dossier de preuve. Voir DECISIONS.md.
 *
 * Règle d'or : le contrat est fabriqué UNE FOIS (texte + empreinte SHA-256 écrits sur la licence) et ensuite seulement RELU. Ni un changement du
 * modèle ni un changement du nom de l'hôtel ne modifie un contrat déjà proposé.
 */
@Injectable()
export class ContratsLicenceService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: SupabaseStorageService
  ) {}

  private urlVerification(numero: string, code: string): string | null {
    const base = (process.env.API_PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL ?? "").trim().replace(/\/+$/, "");
    return base ? `${base}/public/licences/verifier/${encodeURIComponent(numero)}/${code}` : null;
  }

  /* ------------------------------------------------------------------ fabrication du contrat */

  /** Donne un numéro et un contrat figé à une licence qui n'en a pas encore (idempotent : une licence déjà munie d'un contrat est renvoyée telle quelle). */
  async assurerContrat(licenceId: string) {
    const licence = await this.prisma.licenceHotel.findUnique({ where: { id: licenceId }, include: { paiementLicence: { select: { methode: true } } } });
    if (!licence) throw new NotFoundException("Licence introuvable.");
    if (licence.numero && licence.contratTexte && licence.contratEmpreinte) return licence;

    const [hotel, patron, editeur, catalogue] = await Promise.all([
      this.prisma.hotel.findUniqueOrThrow({ where: { id: licence.hotelId }, select: { nom: true, adresse: true, emailContact: true, telephoneContact: true } }),
      this.prisma.utilisateur.findFirst({ where: { hotelId: licence.hotelId, role: "PATRON", actif: true }, orderBy: { createdAt: "asc" }, select: { nom: true, telephone: true, email: true } }),
      lireEditeur(this.prisma),
      lireCatalogue(this.prisma),
    ]);
    const [{ n }] = await this.prisma.$queryRaw<{ n: bigint | number }[]>`SELECT nextval('licence_numero_seq') AS n`;
    const numero = `LIC-${licence.createdAt.getUTCFullYear()}-${String(n).padStart(4, "0")}`;
    const p = catalogue.parametres;
    const contrat = genererContratLicence(
      editeurPourContrat(editeur),
      { nom: hotel.nom, adresse: hotel.adresse, representant: patron?.nom ?? null, telephone: hotel.telephoneContact ?? patron?.telephone ?? null, email: hotel.emailContact ?? patron?.email ?? null },
      {
        numero,
        annees: licence.annees,
        debutLe: licence.debutLe,
        finLe: licence.finLe,
        montant: licence.montant === null ? null : Number(licence.montant),
        devise: licence.devise,
        fraisMaintenanceUsd: licence.fraisMaintenanceUsd === null ? p.fraisMaintenanceUsd : Number(licence.fraisMaintenanceUsd),
        joursMaintenance: 30,
        joursGraceMaintenance: p.joursGraceMaintenance,
        joursPreavisMaintenance: p.joursPreavisMaintenance,
        joursGraceAbonnement: p.joursGrace,
        etabliLe: licence.createdAt,
      }
    );
    // Compare-and-swap : deux demandes simultanées ne figent pas deux contrats différents.
    await this.prisma.licenceHotel.updateMany({
      where: { id: licenceId, numero: null },
      data: { numero, contratVersion: CONTRAT_LICENCE_VERSION, contratTexte: contrat.texte, contratEmpreinte: empreinteSha256(contrat.texte) },
    });
    return this.prisma.licenceHotel.findUniqueOrThrow({ where: { id: licenceId }, include: { paiementLicence: { select: { methode: true } } } });
  }

  /* ------------------------------------------------------------------ côté patron */

  private async licenceEnCours(hotelId: string) {
    const maintenant = new Date();
    return this.prisma.licenceHotel.findFirst({ where: { hotelId, annuleLe: null, debutLe: { lte: maintenant }, finLe: { gte: maintenant } }, orderBy: { debutLe: "desc" } });
  }

  /** Le contrat de la licence en cours, à lire et accepter ; null si l'hôtel n'a pas de licence en cours. */
  async contratPourPatron(utilisateur: UtilisateurAuthentifie): Promise<ContratLicenceVue | null> {
    const enCours = await this.licenceEnCours(utilisateur.hotelId);
    if (!enCours) return null;
    const l = await this.assurerContrat(enCours.id);
    return { licenceId: l.id, numero: l.numero!, version: l.contratVersion ?? CONTRAT_LICENCE_VERSION, texte: l.contratTexte!, empreinte: l.contratEmpreinte!, accepteLe: l.accepteLe?.toISOString() ?? null, accepteParNom: l.accepteParNom };
  }

  /**
   * Le patron clique « J'accepte ». On enregistre qui, quand, d'où (adresse internet) et avec quel appareil, et on exige l'empreinte du texte qu'il
   * a lu : si le texte a changé entre-temps, l'acceptation est refusée. Une seule acceptation par licence, jamais modifiée.
   */
  async accepter(utilisateur: UtilisateurAuthentifie, licenceId: string, empreinte: string, ip: string | null, appareil: string | null) {
    const licence = await this.prisma.licenceHotel.findFirst({ where: { id: licenceId, hotelId: utilisateur.hotelId, annuleLe: null } });
    if (!licence) throw new NotFoundException("Licence introuvable pour votre hôtel.");
    const l = await this.assurerContrat(licence.id);
    if (l.contratEmpreinte !== empreinte.toLowerCase()) throw new ConflictException("Le contrat a changé depuis que vous l'avez ouvert : rouvrez-le et relisez-le avant d'accepter.");
    if (l.accepteLe) throw new ConflictException("Ce contrat a déjà été accepté.");
    const nom = await this.prisma.utilisateur.findUnique({ where: { id: utilisateur.userId }, select: { nom: true } });
    const { count } = await this.prisma.licenceHotel.updateMany({
      where: { id: l.id, accepteLe: null },
      data: { accepteLe: new Date(), accepteParUtilisateurId: utilisateur.userId, accepteParNom: nom?.nom ?? null, accepteIp: ip?.slice(0, 64) ?? null, accepteAppareil: appareil?.slice(0, 300) ?? null },
    });
    if (count === 0) throw new ConflictException("Ce contrat a déjà été accepté.");
    return this.contratPourPatron(utilisateur);
  }

  /* ------------------------------------------------------------------ côté super-admin : documents */

  private async licenceDeHotel(hotelId: string, licenceId: string) {
    const licence = await this.prisma.licenceHotel.findFirst({ where: { id: licenceId, hotelId } });
    if (!licence) throw new NotFoundException("Licence introuvable pour cet hôtel.");
    return this.assurerContrat(licence.id);
  }

  private async noms(ids: (string | null | undefined)[]) {
    const uniques = [...new Set(ids.filter((x): x is string => !!x))];
    const lignes = uniques.length ? await this.prisma.superAdmin.findMany({ where: { id: { in: uniques } }, select: { id: true, nom: true } }) : [];
    return new Map(lignes.map((a) => [a.id, a.nom]));
  }

  /** Toutes les données d'impression d'une licence, lues dans la base (le contrat vient du texte ENREGISTRÉ). */
  private async donnees(licenceId: string, avecImage = false): Promise<DonneesLicencePdf> {
    const l = await this.assurerContrat(licenceId);
    const [hotel, patron, editeur, noms] = await Promise.all([
      this.prisma.hotel.findUniqueOrThrow({ where: { id: l.hotelId }, select: { nom: true, adresse: true } }),
      this.prisma.utilisateur.findFirst({ where: { hotelId: l.hotelId, role: "PATRON", actif: true }, orderBy: { createdAt: "asc" }, select: { nom: true } }),
      lireEditeur(this.prisma),
      this.noms([l.enregistreParSuperAdminId]),
    ]);
    const { parametres } = await lireCatalogue(this.prisma);
    let image: Buffer | null = null;
    if (avecImage && l.scanChemin && l.scanType?.startsWith("image/")) image = await this.storage.lireContrat(l.scanChemin);
    const empreinte = l.contratEmpreinte!;
    const code = codeControle(empreinte);
    return {
      numero: l.numero!,
      hotelNom: hotel.nom,
      hotelAdresse: hotel.adresse,
      patronNom: patron?.nom ?? null,
      annees: l.annees,
      debutLe: l.debutLe,
      finLe: l.finLe,
      montant: l.montant === null ? null : Number(l.montant),
      devise: l.devise,
      methode: (l as { paiementLicence?: { methode: string } | null }).paiementLicence?.methode ?? null,
      fraisMaintenanceUsd: l.fraisMaintenanceUsd === null ? parametres.fraisMaintenanceUsd : Number(l.fraisMaintenanceUsd),
      etabliLe: l.createdAt,
      contratVersion: l.contratVersion ?? CONTRAT_LICENCE_VERSION,
      contratTexte: l.contratTexte!,
      contratEmpreinte: empreinte,
      code,
      urlVerification: this.urlVerification(l.numero!, code),
      editeur: { nom: editeur.editeurNom, adresse: editeur.editeurAdresse, rccm: editeur.editeurRccm, nif: editeur.editeurNif, telephone: editeur.editeurTelephone, email: editeur.editeurEmail, representant: editeur.editeurRepresentant, fonction: editeur.editeurFonction },
      enregistreParNom: l.enregistreParSuperAdminId ? (noms.get(l.enregistreParSuperAdminId) ?? null) : null,
      acceptation: l.accepteLe ? { le: l.accepteLe, parNom: l.accepteParNom, ip: l.accepteIp, appareil: l.accepteAppareil } : null,
      scan: l.scanChemin && l.scanEnvoyeLe && l.scanType && l.scanEmpreinte ? { envoyeLe: l.scanEnvoyeLe, type: l.scanType, taille: l.scanTaille ?? 0, empreinte: l.scanEmpreinte, image } : null,
      annulation: l.annuleLe ? { le: l.annuleLe, motif: l.motifAnnulation ?? "" } : null,
    };
  }

  private fichier(nom: string, pdf: Buffer): FichierPdf {
    return { nom, type: "application/pdf", base64: pdf.toString("base64") };
  }

  async contratPdf(hotelId: string, licenceId: string): Promise<FichierPdf> {
    const l = await this.licenceDeHotel(hotelId, licenceId);
    return this.fichier(`Contrat-${l.numero}.pdf`, await pdfContrat(await this.donnees(l.id)));
  }

  async recuLicencePdf(hotelId: string, licenceId: string): Promise<FichierPdf> {
    const l = await this.licenceDeHotel(hotelId, licenceId);
    return this.fichier(`Recu-licence-${l.numero}.pdf`, await pdfRecuLicence(await this.donnees(l.id)));
  }

  /** Numéro de reçu d'un paiement de maintenance : attribué à la première édition, puis jamais modifié. */
  private async assurerNumeroRecu(paiementId: string, numeroActuel: string | null, creeLe: Date): Promise<string> {
    if (numeroActuel) return numeroActuel;
    const [{ n }] = await this.prisma.$queryRaw<{ n: bigint | number }[]>`SELECT nextval('recu_maintenance_numero_seq') AS n`;
    const numero = `MNT-${creeLe.getUTCFullYear()}-${String(n).padStart(5, "0")}`;
    await this.prisma.paiementMaintenance.updateMany({ where: { id: paiementId, numeroRecu: null }, data: { numeroRecu: numero } });
    const relu = await this.prisma.paiementMaintenance.findUniqueOrThrow({ where: { id: paiementId }, select: { numeroRecu: true } });
    return relu.numeroRecu!;
  }

  private async donneesMaintenance(hotelId: string, paiementId: string, editeur: Awaited<ReturnType<typeof lireEditeur>>, hotelNom: string): Promise<DonneesMaintenancePdf> {
    const m = await this.prisma.paiementMaintenance.findFirst({
      where: { id: paiementId, hotelId },
      include: { paiementAbonnement: { select: { confirmeLe: true, referenceFournisseur: true, referenceDemande: true } }, licence: { select: { numero: true } } },
    });
    if (!m) throw new NotFoundException("Paiement de maintenance introuvable pour cet hôtel.");
    const numeroRecu = await this.assurerNumeroRecu(m.id, m.numeroRecu, m.createdAt);
    const noms = await this.noms([m.enregistreParSuperAdminId]);
    return {
      numeroRecu,
      hotelNom,
      licenceNumero: m.licence?.numero ?? null,
      editeur: { nom: editeur.editeurNom, adresse: editeur.editeurAdresse, rccm: editeur.editeurRccm, nif: editeur.editeurNif, telephone: editeur.editeurTelephone, email: editeur.editeurEmail, representant: editeur.editeurRepresentant, fonction: editeur.editeurFonction },
      mois: m.mois,
      montant: Number(m.montant),
      devise: m.devise,
      methode: m.methode,
      source: m.paiementAbonnement ? "EN_LIGNE" : "MANUEL",
      reference: m.paiementAbonnement?.referenceFournisseur ?? m.paiementAbonnement?.referenceDemande ?? null,
      payeLe: m.paiementAbonnement?.confirmeLe ?? m.createdAt,
      periodeCouverteJusquau: m.periodeCouverteJusquau,
      enregistreParNom: m.enregistreParSuperAdminId ? (noms.get(m.enregistreParSuperAdminId) ?? null) : null,
      annulation: m.annuleLe ? { le: m.annuleLe, motif: m.motifAnnulation ?? "" } : null,
    };
  }

  async recuMaintenancePdf(hotelId: string, paiementId: string): Promise<FichierPdf> {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId }, select: { nom: true } });
    if (!hotel) throw new NotFoundException("Hôtel introuvable.");
    const d = await this.donneesMaintenance(hotelId, paiementId, await lireEditeur(this.prisma), hotel.nom);
    return this.fichier(`Recu-maintenance-${d.numeroRecu}.pdf`, await pdfRecuMaintenance(d));
  }

  /** Tout le dossier d'une licence en un seul PDF : reçu, contrat, acceptation, exemplaire signé (si image), paiements de maintenance. */
  async dossierPreuvePdf(hotelId: string, licenceId: string, superAdminId: string): Promise<FichierPdf> {
    const l = await this.licenceDeHotel(hotelId, licenceId);
    const [donnees, editeur, maintenances, noms] = await Promise.all([
      this.donnees(l.id, true),
      lireEditeur(this.prisma),
      this.prisma.paiementMaintenance.findMany({ where: { hotelId, licenceId: l.id }, orderBy: { createdAt: "asc" }, select: { id: true } }),
      this.noms([superAdminId]),
    ]);
    const lignes: DonneesMaintenancePdf[] = [];
    for (const m of maintenances) lignes.push(await this.donneesMaintenance(hotelId, m.id, editeur, donnees.hotelNom));
    const pdf = await pdfDossierPreuve(donnees, lignes, { le: new Date(), parNom: noms.get(superAdminId) ?? null });
    return this.fichier(`Dossier-de-preuve-${l.numero}.pdf`, pdf);
  }

  /* ------------------------------------------------------------------ exemplaire papier signé */

  /** Enregistre l'exemplaire signé et numérisé (PDF, JPEG ou PNG). Un nouvel envoi remplace le précédent dans le dossier ; l'ancien fichier reste dans le stockage. */
  async enregistrerScan(hotelId: string, licenceId: string, contenu: Buffer | undefined, superAdminId: string) {
    if (!contenu || contenu.length === 0) throw new BadRequestException("Aucun fichier reçu : choisissez le scan ou la photo du contrat signé.");
    if (contenu.length > TAILLE_MAX_SCAN) throw new BadRequestException("Fichier trop lourd : 8 Mo au plus.");
    const type = typeDuFichier(contenu);
    if (!type) throw new BadRequestException("Format non accepté : envoyez un PDF, une photo JPEG ou une image PNG.");
    const l = await this.licenceDeHotel(hotelId, licenceId);
    if (l.annuleLe) throw new BadRequestException("Cette licence est annulée.");
    const chemin = `${hotelId}/${l.id}/${randomUUID()}.${type.extension}`;
    await this.storage.envoyerContrat(chemin, contenu, type.type);
    await this.prisma.licenceHotel.update({
      where: { id: l.id },
      data: { scanChemin: chemin, scanType: type.type, scanTaille: contenu.length, scanEmpreinte: empreinteSha256(contenu), scanEnvoyeLe: new Date(), scanEnvoyeParSuperAdminId: superAdminId },
    });
    return { ok: true };
  }

  /** Relit l'exemplaire signé enregistré. */
  async scanSigne(hotelId: string, licenceId: string): Promise<FichierPdf> {
    const l = await this.licenceDeHotel(hotelId, licenceId);
    if (!l.scanChemin || !l.scanType) throw new NotFoundException("Aucun exemplaire signé n'a été enregistré pour cette licence.");
    const contenu = await this.storage.lireContrat(l.scanChemin);
    if (!contenu) throw new NotFoundException("Le fichier de l'exemplaire signé est introuvable dans le stockage.");
    const extension = l.scanType === "application/pdf" ? "pdf" : l.scanType === "image/png" ? "png" : "jpg";
    return { nom: `Contrat-signe-${l.numero}.${extension}`, type: l.scanType, base64: contenu.toString("base64") };
  }

  /* ------------------------------------------------------------------ vérification publique */

  /** Contrôle d'un numéro + code (QR code des documents) : ne révèle que de quoi confirmer l'authenticité. */
  async verifier(numero: string, code: string): Promise<VerificationLicenceVue> {
    const l = await this.prisma.licenceHotel.findUnique({ where: { numero }, include: { hotel: { select: { nom: true } } } });
    if (!l || !l.contratEmpreinte || codeControle(l.contratEmpreinte) !== code.trim().toUpperCase()) return { authentique: false };
    return {
      authentique: true,
      numero: l.numero!,
      hotel: l.hotel.nom,
      annees: l.annees,
      debutLe: l.debutLe.toISOString(),
      finLe: l.finLe.toISOString(),
      annulee: !!l.annuleLe,
      accepteeLe: l.accepteLe?.toISOString() ?? null,
    };
  }

  /** Page lisible par un humain (ouverte par le QR code). */
  async pageVerification(numero: string, code: string): Promise<string> {
    const v = await this.verifier(numero, code);
    const corps = v.authentique
      ? `<h1 class="ok">Document authentique</h1>
         <p>Le contrat de licence <b>${echapper(v.numero!)}</b> existe bien dans le registre de l'éditeur.</p>
         <dl><dt>Hôtel</dt><dd>${echapper(v.hotel!)}</dd><dt>Licence</dt><dd>${v.annees} an${(v.annees ?? 1) > 1 ? "s" : ""}</dd><dt>Du</dt><dd>${new Date(v.debutLe!).toISOString().slice(0, 10)}</dd><dt>Au</dt><dd>${new Date(v.finLe!).toISOString().slice(0, 10)}</dd><dt>Statut</dt><dd>${v.annulee ? "ANNULÉE" : "Valable"}</dd><dt>Accepté dans l'application</dt><dd>${v.accepteeLe ? new Date(v.accepteeLe).toISOString().slice(0, 10) : "pas encore"}</dd></dl>`
      : `<h1 class="ko">Document non reconnu</h1><p>Ce numéro et ce code ne correspondent à aucun contrat. Le document a peut-être été modifié ou contrefait.</p>`;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vérification de licence</title><style>body{font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 16px;color:#1a1a1a}h1.ok{color:#1f6b35}h1.ko{color:#a11d1d}dt{color:#666;margin-top:10px;font-size:.85rem}dd{margin:0;font-weight:600}</style></head><body>${corps}</body></html>`;
  }
}
