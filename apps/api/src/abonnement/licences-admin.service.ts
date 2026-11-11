import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { type PrismaClient } from "@hotel-chicago/database";
import { debutNouvelleLicence, finLicence, finMaintenance, nouvelleFinMaintenance } from "@hotel-chicago/regles";
import { PRISMA } from "../prisma/prisma.module";
import { lireCatalogue } from "../common/abonnement/catalogue";
import { contexteLicence, etatDeHotel, inclureValidite, recalculerStatutHotel } from "../common/abonnement/validite";
import type { ActiverLicenceDto, EnregistrerMaintenanceDto } from "./dto/licence.dto";
import { ContratsLicenceService } from "./documents-licence/contrats-licence.service";

/**
 * Licences de 1, 2 ou 3 ans (11/11/2026), activées à la main par le SUPER-ADMIN après réception de l'argent en main propre.
 *
 * Une licence donne à l'hôtel TOUTES les fonctions, sans plafond de chambres, pour toute sa durée ; il ne paie plus que les frais de
 * maintenance (30 jours, premier mois compris), dans l'application. L'activation crée aussi une ligne PaiementLicence qui court jusqu'à la fin
 * de la licence : l'hôtel compte comme « payé » partout (essai, plafonds, nettoyage des essais abandonnés), et à la fin de la licence il retombe
 * sur l'abonnement mensuel normal (3 jours de grâce). Tout est journalisé : une saisie erronée est ANNULÉE (motif obligatoire), jamais effacée.
 */
@Injectable()
export class LicencesAdminService {
  private readonly logger = new Logger(LicencesAdminService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly contrats: ContratsLicenceService
  ) {}

  private async hotel(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, nom: true } });
    if (!hotel) throw new NotFoundException(`Aucun hôtel trouvé avec l'identifiant ${hotelId}.`);
    return hotel;
  }

  /** Active une licence. Si l'hôtel en a déjà une qui court encore, la nouvelle commence à sa fin (acheter d'avance ne fait perdre aucun jour). */
  async activer(hotelId: string, dto: ActiverLicenceDto, superAdminId: string) {
    const hotel = await this.hotel(hotelId);
    const maintenant = new Date();
    const enCours = await this.prisma.licenceHotel.findFirst({ where: { hotelId, annuleLe: null, finLe: { gt: maintenant } }, orderBy: { finLe: "desc" }, select: { finLe: true } });
    const debut = debutNouvelleLicence(enCours?.finLe ?? null, maintenant);
    const fin = finLicence(debut, dto.annees);
    const resume = `Licence ${dto.annees} an${dto.annees > 1 ? "s" : ""} activée à la main${dto.note?.trim() ? ` — ${dto.note.trim()}` : ""}`;

    const licence = await this.prisma.$transaction(async (tx) => {
      const paiement = await tx.paiementLicence.create({
        data: {
          hotelId,
          montant: dto.montant ?? 0,
          devise: dto.devise ?? "USD",
          methode: dto.methode ?? "ESPECES",
          periodeCouverteJusquau: fin,
          note: resume,
          enregistreParSuperAdminId: superAdminId,
        },
      });
      const creee = await tx.licenceHotel.create({
        data: {
          hotelId,
          annees: dto.annees,
          debutLe: debut,
          finLe: fin,
          montant: dto.montant ?? null,
          devise: dto.montant === undefined ? null : (dto.devise ?? "USD"),
          fraisMaintenanceUsd: dto.fraisMaintenanceUsd ?? null,
          note: dto.note?.trim() || null,
          paiementLicenceId: paiement.id,
          enregistreParSuperAdminId: superAdminId,
        },
      });
      // Toutes les fonctions et aucun plafond de chambres : plus de formule. Enregistrer un paiement réactive toujours l'hôtel (même suspendu ou résilié).
      await tx.hotel.update({ where: { id: hotelId }, data: { statutLicence: "ACTIF", suspensionManuelle: false, formule: null } });
      return creee;
    });
    this.logger.log(`Licence ${dto.annees} an(s) activée pour ${hotel.nom} (${hotelId}) du ${debut.toISOString()} au ${fin.toISOString()}`);
    // Numéro et contrat figés dès l'activation. Si cette étape échoue, la licence reste valable : le contrat sera créé à la première demande (idempotent).
    await this.contrats.assurerContrat(licence.id).catch((e) => this.logger.error(`Contrat de la licence ${licence.id} non créé à l'activation : ${e instanceof Error ? e.message : e}`));
    return this.lister(hotelId).then((r) => ({ ...r, licenceActivee: licence.id }));
  }

  /** Les licences de l'hôtel (annulées comprises) et ses paiements de maintenance, avec l'état actuel : l'écran du super-admin montre la trace complète. */
  async lister(hotelId: string) {
    await this.hotel(hotelId);
    const maintenant = new Date();
    const [licences, maintenances, hotel, catalogue] = await Promise.all([
      this.prisma.licenceHotel.findMany({ where: { hotelId }, orderBy: { debutLe: "desc" } }),
      this.prisma.paiementMaintenance.findMany({ where: { hotelId }, orderBy: { createdAt: "desc" }, include: { paiementAbonnement: { select: { id: true } } } }),
      this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, include: inclureValidite(maintenant) }),
      lireCatalogue(this.prisma),
    ]);
    const ids = [...new Set([...licences.map((l) => l.enregistreParSuperAdminId), ...maintenances.map((m) => m.enregistreParSuperAdminId)].filter((x): x is string => !!x))];
    const noms = new Map((await this.prisma.superAdmin.findMany({ where: { id: { in: ids } }, select: { id: true, nom: true } })).map((a) => [a.id, a.nom]));
    const contexte = contexteLicence(hotel, catalogue.parametres);
    return {
      etat: etatDeHotel(hotel, catalogue.parametres, maintenant),
      licenceEnCoursId: contexte?.id ?? null,
      fraisMaintenanceParDefautUsd: catalogue.parametres.fraisMaintenanceUsd,
      licences: licences.map((l) => ({
        id: l.id,
        annees: l.annees,
        debutLe: l.debutLe,
        finLe: l.finLe,
        montant: l.montant === null ? null : Number(l.montant),
        devise: l.devise,
        fraisMaintenanceUsd: l.fraisMaintenanceUsd === null ? null : Number(l.fraisMaintenanceUsd),
        note: l.note,
        createdAt: l.createdAt,
        annuleLe: l.annuleLe,
        motifAnnulation: l.motifAnnulation,
        enregistreParNom: l.enregistreParSuperAdminId ? (noms.get(l.enregistreParSuperAdminId) ?? null) : null,
        numero: l.numero,
        contratVersion: l.contratVersion,
        contratEmpreinte: l.contratEmpreinte,
        accepteLe: l.accepteLe,
        accepteParNom: l.accepteParNom,
        scanEnvoyeLe: l.scanEnvoyeLe,
        scanType: l.scanType,
      })),
      maintenances: maintenances.map((m) => ({
        id: m.id,
        licenceId: m.licenceId,
        mois: m.mois,
        montant: Number(m.montant),
        devise: m.devise,
        methode: m.methode,
        periodeCouverteJusquau: m.periodeCouverteJusquau,
        note: m.note,
        source: m.paiementAbonnement ? ("EN_LIGNE" as const) : ("MANUEL" as const),
        createdAt: m.createdAt,
        annuleLe: m.annuleLe,
        motifAnnulation: m.motifAnnulation,
        enregistreParNom: m.enregistreParSuperAdminId ? (noms.get(m.enregistreParSuperAdminId) ?? null) : null,
        numeroRecu: m.numeroRecu,
      })),
    };
  }

  /** Annule une licence (erreur de saisie, argent non reçu) : elle ne compte plus nulle part ; la ligne de paiement qui l'accompagne est annulée avec elle. */
  async annuler(hotelId: string, licenceId: string, motif: string, superAdminId: string) {
    const licence = await this.prisma.licenceHotel.findFirst({ where: { id: licenceId, hotelId } });
    if (!licence) throw new NotFoundException("Licence introuvable pour cet hôtel.");
    if (licence.annuleLe) throw new ConflictException("Cette licence est déjà annulée.");
    const maintenant = new Date();
    const m = motif.trim();
    await this.prisma.$transaction(async (tx) => {
      // Compare-and-swap : deux annulations simultanées ne peuvent pas toutes les deux réussir.
      const { count } = await tx.licenceHotel.updateMany({ where: { id: licenceId, annuleLe: null }, data: { annuleLe: maintenant, annuleParSuperAdminId: superAdminId, motifAnnulation: m } });
      if (count === 0) throw new ConflictException("Cette licence est déjà annulée.");
      if (licence.paiementLicenceId) {
        await tx.paiementLicence.updateMany({ where: { id: licence.paiementLicenceId, annuleLe: null }, data: { annuleLe: maintenant, annuleParSuperAdminId: superAdminId, motifAnnulation: `Licence annulée : ${m}` } });
      }
    });
    const { parametres } = await lireCatalogue(this.prisma);
    await recalculerStatutHotel(this.prisma, hotelId, parametres);
    return this.lister(hotelId);
  }

  /** Frais de maintenance reçus à la main (espèces, virement…) : prolonge l'échéance de `mois` périodes de 30 jours. Réactive l'hôtel. */
  async enregistrerMaintenance(hotelId: string, dto: EnregistrerMaintenanceDto, superAdminId: string) {
    await this.hotel(hotelId);
    const maintenant = new Date();
    const hotel = await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, include: inclureValidite(maintenant) });
    const { parametres } = await lireCatalogue(this.prisma);
    const licence = contexteLicence(hotel, parametres);
    if (!licence) throw new BadRequestException("Cet hôtel n'a pas de licence en cours : il n'y a pas de frais de maintenance à enregistrer.");
    const fin = nouvelleFinMaintenance(finMaintenance(licence), maintenant, dto.mois);
    await this.prisma.$transaction([
      this.prisma.paiementMaintenance.create({
        data: {
          hotelId,
          licenceId: licence.id,
          mois: dto.mois,
          montant: dto.montant,
          devise: dto.devise,
          methode: dto.methode,
          periodeCouverteJusquau: fin,
          note: dto.note?.trim() || null,
          enregistreParSuperAdminId: superAdminId,
        },
      }),
      this.prisma.hotel.update({ where: { id: hotelId }, data: { statutLicence: "ACTIF", suspensionManuelle: false } }),
    ]);
    return this.lister(hotelId);
  }

  /** Annule un paiement de maintenance SAISI À LA MAIN. Un paiement en ligne réellement reçu ne s'annule pas ici. */
  async annulerMaintenance(hotelId: string, paiementId: string, motif: string, superAdminId: string) {
    const paiement = await this.prisma.paiementMaintenance.findFirst({ where: { id: paiementId, hotelId }, include: { paiementAbonnement: { select: { id: true } } } });
    if (!paiement) throw new NotFoundException("Paiement de maintenance introuvable pour cet hôtel.");
    if (paiement.paiementAbonnement) throw new BadRequestException("C'est un paiement en ligne réellement reçu : il ne peut pas être annulé ici.");
    if (paiement.annuleLe) throw new ConflictException("Ce paiement est déjà annulé.");
    const { count } = await this.prisma.paiementMaintenance.updateMany({
      where: { id: paiementId, annuleLe: null },
      data: { annuleLe: new Date(), annuleParSuperAdminId: superAdminId, motifAnnulation: motif.trim() },
    });
    if (count === 0) throw new ConflictException("Ce paiement est déjà annulé.");
    const { parametres } = await lireCatalogue(this.prisma);
    await recalculerStatutHotel(this.prisma, hotelId, parametres);
    return this.lister(hotelId);
  }
}
