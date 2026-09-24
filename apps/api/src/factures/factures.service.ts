import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Devise, PrismaClient } from "@hotel-chicago/database";
import { PRISMA } from "../prisma/prisma.module";
import { CreateFactureDto } from "./dto/create-facture.dto";
import { AnnulerFactureDto } from "./dto/annuler-facture.dto";
import { calculerEncaissement } from "./encaissement.util";

@Injectable()
export class FacturesService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  findAll(reservationId?: string) {
    return this.prisma.facture.findMany({
      where: { reservationId },
      include: { reservation: { include: { chambre: true, client: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const facture = await this.prisma.facture.findUnique({
      where: { id },
      include: { reservation: { include: { chambre: true, client: true } } },
    });
    if (!facture) {
      throw new NotFoundException(`Aucune facture trouvée avec l'identifiant ${id}.`);
    }
    return facture;
  }

  async create(dto: CreateFactureDto) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: dto.reservationId },
      include: { chambre: true, facture: true },
    });
    if (!reservation) {
      throw new NotFoundException(`Aucune réservation trouvée avec l'identifiant ${dto.reservationId}.`);
    }
    if (reservation.facture) {
      throw new ConflictException("Cette réservation a déjà une facture. Utilisez l'annulation si elle est erronée.");
    }
    if (reservation.statut !== "EN_COURS" && reservation.statut !== "TERMINEE") {
      throw new ConflictException(
        `Impossible de facturer une réservation ${reservation.statut} : ` +
          "le client doit être arrivé (check-in) avant de pouvoir être facturé."
      );
    }

    const nuits = Math.max(
      1,
      Math.round((reservation.dateDepart.getTime() - reservation.dateArrivee.getTime()) / (24 * 60 * 60 * 1000))
    );
    const montantChambre = Number(reservation.chambre.prixParNuit) * nuits;
    const deviseChambre = reservation.chambre.devise;
    const montantDuChambre = Math.max(0, montantChambre - Number(reservation.acompte));

    // Consommations cafétaria facturées sur la chambre (VenteCafeteria.reservationLieeId,
    // section 9.2) : additionnées par devise, jamais fusionnées entre elles (section 9.4).
    const ventesLiees = await this.prisma.venteCafeteria.findMany({
      where: { reservationLieeId: dto.reservationId, annuleLe: null },
    });
    const cafeteriaUSD = ventesLiees.reduce((somme, v) => somme + Number(v.montantTotalUSD), 0);
    const cafeteriaCDF = ventesLiees.reduce((somme, v) => somme + Number(v.montantTotalCDF), 0);

    const montantTotalUSD = (deviseChambre === Devise.USD ? montantDuChambre : 0) + cafeteriaUSD;
    const montantTotalCDF = (deviseChambre === Devise.CDF ? montantDuChambre : 0) + cafeteriaCDF;

    const paiementCroiseDemande = dto.deviseRegleeParClient !== undefined || dto.montantRegleParClient !== undefined;
    if (paiementCroiseDemande && montantTotalUSD > 0 && montantTotalCDF > 0) {
      throw new BadRequestException(
        "Cette facture mélange un montant dû en USD et en CDF (chambre + consommations cafétaria) : " +
          "le paiement croisé automatique n'est pas supporté pour un total mixte (section 9.4). " +
          "Réglez chaque devise séparément."
      );
    }

    const deviseDue: Devise = montantTotalUSD > 0 ? Devise.USD : Devise.CDF;
    const dernierTaux = await this.prisma.tauxChange.findFirst({ orderBy: { createdAt: "desc" } });

    const encaissement = calculerEncaissement({
      montantDu: montantTotalUSD > 0 ? montantTotalUSD : montantTotalCDF,
      deviseDue,
      deviseRegleeParClient: dto.deviseRegleeParClient,
      montantRegleParClient: dto.montantRegleParClient,
      deviseRenduChoisie: dto.deviseRenduChoisie,
      cdfParUsd: dernierTaux ? Number(dernierTaux.cdfParUsd) : undefined,
    });

    const numeroRecu = await this.genererNumeroRecu();

    return this.prisma.facture.create({
      data: {
        reservationId: dto.reservationId,
        montantChambre,
        deviseChambre,
        montantTotalUSD,
        montantTotalCDF,
        modePaiement: dto.modePaiement,
        deviseRegleeParClient: dto.deviseRegleeParClient,
        montantRegleParClient: dto.montantRegleParClient,
        tauxChangeApplique: encaissement.tauxChangeApplique,
        deviseMonnaieRendue: encaissement.deviseMonnaieRendue,
        montantMonnaieRendue: encaissement.montantMonnaieRendue,
        numeroRecu,
      },
      include: { reservation: { include: { chambre: true, client: true } } },
    });
  }

  async annuler(id: string, dto: AnnulerFactureDto) {
    const facture = await this.findOne(id);
    if (facture.annuleLe) {
      throw new ConflictException("Cette facture est déjà annulée.");
    }
    return this.prisma.facture.update({
      where: { id },
      data: { annuleLe: new Date(), motifAnnulation: dto.motif, syncVersion: { increment: 1 } },
    });
  }

  /**
   * REC-YYYYMMDD-#### (section 11.3). Basé sur le PLUS GRAND numéro déjà
   * utilisé aujourd'hui, jamais sur un COUNT() de lignes — un count() suppose
   * une séquence sans trou, ce qui s'est révélé faux en pratique (voir le même
   * bug corrigé dans CafeteriaService.genererNumeroRecu, trouvé en testant
   * PARTAGE_EGAL contre la vraie base). Pas de gestion du préfixe TEMP- ici,
   * réservée au mode hors ligne (Phase 4).
   */
  private async genererNumeroRecu(): Promise<string> {
    const aaaammjj = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const prefixe = `REC-${aaaammjj}-`;

    const derniere = await this.prisma.facture.findFirst({
      where: { numeroRecu: { startsWith: prefixe } },
      orderBy: { numeroRecu: "desc" },
      select: { numeroRecu: true },
    });
    const dernierNumero = derniere ? parseInt(derniere.numeroRecu.slice(prefixe.length), 10) : 0;

    return `${prefixe}${String(dernierNumero + 1).padStart(4, "0")}`;
  }
}
