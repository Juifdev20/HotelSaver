import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Devise, Prisma, PrismaClient } from "@hotel-chicago/database";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { messages } from "../notifications/messages";
import { CreateFactureDto } from "./dto/create-facture.dto";
import { AnnulerFactureDto } from "./dto/annuler-facture.dto";
import { calculerEncaissement } from "./encaissement.util";

/** Reprises quand deux postes tirent le même numéro de reçu au même instant. */
const ESSAIS_NUMERO_RECU = 5;

@Injectable()
export class FacturesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notifications: NotificationsService
  ) {}

  findAll(hotelId: string, reservationId?: string) {
    return this.prisma.facture.findMany({
      where: { hotelId, reservationId },
      include: { reservation: { include: { chambre: true, client: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string, hotelId: string) {
    const facture = await this.prisma.facture.findUnique({
      where: { id, hotelId },
      include: { reservation: { include: { chambre: true, client: true } } },
    });
    if (!facture) {
      throw new NotFoundException(`Aucune facture trouvée avec l'identifiant ${id}.`);
    }
    return facture;
  }

  async create(dto: CreateFactureDto, hotelId: string, options: { numeroProvisoire?: string } = {}) {
    // « Facturé chambre » ne vaut que pour une consommation de cafétaria ajoutée au séjour : la facture du séjour elle-même est
    // toujours encaissée, sinon elle serait enregistrée comme réglée sans qu'aucun argent n'ait été reçu.
    if (dto.modePaiement === "FACTURE_CHAMBRE") {
      throw new BadRequestException("Une facture de séjour se règle en espèces ou en mobile money.");
    }
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: dto.reservationId, hotelId },
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
      where: { hotelId, reservationLieeId: dto.reservationId, annuleLe: null },
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
    const dernierTaux = await this.prisma.tauxChange.findFirst({ where: { hotelId }, orderBy: { createdAt: "desc" } });

    const encaissement = calculerEncaissement({
      montantDu: montantTotalUSD > 0 ? montantTotalUSD : montantTotalCDF,
      deviseDue,
      deviseRegleeParClient: dto.deviseRegleeParClient,
      montantRegleParClient: dto.montantRegleParClient,
      deviseRenduChoisie: dto.deviseRenduChoisie,
      cdfParUsd: dernierTaux ? Number(dernierTaux.cdfParUsd) : undefined,
    });

    // Deux postes qui facturent au même instant peuvent calculer le même « plus grand numéro + 1 » : la contrainte
    // d'unicité (hôtel, numéro) en refuse un, qui repart avec le numéro suivant au lieu d'échouer.
    for (let essai = 1; ; essai++) {
      const numeroRecu = await this.genererNumeroRecu(hotelId);
      try {
        return await this.prisma.facture.create({
          data: {
            hotelId,
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
            numeroProvisoire: options.numeroProvisoire,
          },
          include: { reservation: { include: { chambre: true, client: true } } },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        // Doublon : soit quelqu'un vient de facturer ce séjour (vrai conflit), soit le numéro est pris (on repart avec le suivant).
        if (await this.prisma.facture.findUnique({ where: { reservationId: dto.reservationId }, select: { id: true } })) {
          throw new ConflictException("Cette réservation a déjà une facture. Utilisez l'annulation si elle est erronée.");
        }
        if (essai >= ESSAIS_NUMERO_RECU) throw error;
      }
    }
  }

  /** `par` = qui annule : le patron est prévenu des annulations de son équipe (pas des siennes). */
  async annuler(id: string, dto: AnnulerFactureDto, hotelId: string, par?: UtilisateurAuthentifie) {
    const facture = await this.findOne(id, hotelId);
    if (facture.annuleLe) {
      throw new ConflictException("Cette facture est déjà annulée.");
    }
    const annulee = await this.prisma.facture.update({
      where: { id, hotelId },
      data: { annuleLe: new Date(), motifAnnulation: dto.motif, syncVersion: { increment: 1 } },
    });
    if (par?.role !== Role.PATRON) {
      void this.notifications.emettre({
        hotelId,
        roles: [Role.PATRON],
        ...messages.recuAnnule({ numeroRecu: facture.numeroRecu, motif: dto.motif, par: par?.nom }),
      });
    }
    return annulee;
  }

  /**
   * REC-YYYYMMDD-#### (section 11.3). Basé sur le PLUS GRAND numéro déjà
   * utilisé aujourd'hui, jamais sur un COUNT() de lignes — un count() suppose
   * une séquence sans trou, ce qui s'est révélé faux en pratique (voir le même
   * bug corrigé dans CafeteriaService.genererNumeroRecu, trouvé en testant
   * PARTAGE_EGAL contre la vraie base). Pas de gestion du préfixe TEMP- ici,
   * réservée au mode hors ligne (Phase 4). Numérotée par hôtel (Phase 2) :
   * `numeroRecu` n'est plus unique que combiné à `hotelId` (voir schema.prisma).
   */
  private async genererNumeroRecu(hotelId: string): Promise<string> {
    const aaaammjj = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const prefixe = `REC-${aaaammjj}-`;

    const derniere = await this.prisma.facture.findFirst({
      where: { hotelId, numeroRecu: { startsWith: prefixe } },
      orderBy: { numeroRecu: "desc" },
      select: { numeroRecu: true },
    });
    const dernierNumero = derniere ? parseInt(derniere.numeroRecu.slice(prefixe.length), 10) : 0;

    return `${prefixe}${String(dernierNumero + 1).padStart(4, "0")}`;
  }
}
