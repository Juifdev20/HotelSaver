import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@hotel-chicago/database";
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
    const montantDu = Math.max(0, montantChambre - Number(reservation.acompte));

    const dernierTaux = await this.prisma.tauxChange.findFirst({ orderBy: { createdAt: "desc" } });

    const encaissement = calculerEncaissement({
      montantDu,
      deviseDue: deviseChambre,
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
        montantTotalUSD: deviseChambre === "USD" ? montantDu : 0,
        montantTotalCDF: deviseChambre === "CDF" ? montantDu : 0,
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
      data: { annuleLe: new Date(), motifAnnulation: dto.motif },
    });
  }

  /** REC-YYYYMMDD-#### (section 11.3). Compte les factures du jour ; pas de
   * gestion du préfixe TEMP- ici, réservée au mode hors ligne (Phase 4). */
  private async genererNumeroRecu(): Promise<string> {
    const debutJournee = new Date();
    debutJournee.setHours(0, 0, 0, 0);

    const compte = await this.prisma.facture.count({ where: { createdAt: { gte: debutJournee } } });

    const aaaammjj = new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");

    return `REC-${aaaammjj}-${String(compte + 1).padStart(4, "0")}`;
  }
}
