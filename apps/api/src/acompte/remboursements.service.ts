import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@hotel-chicago/database";
import { Role } from "@hotel-chicago/types";
import type { MotifRemboursement, RemboursementVue, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { messages } from "../notifications/messages";
import { arrondirDevise } from "./calcul-acompte";
import type { TraiterRemboursementDto } from "./dto/reglages-paiement.dto";

const fmt = (m: number, devise: "USD" | "CDF") => (devise === "USD" ? `${m.toLocaleString("fr-FR", { minimumFractionDigits: Number.isInteger(m) ? 0 : 2 })} $` : `${Math.round(m).toLocaleString("fr-FR")} FC`);

/** Déduit le motif d'une annulation faite par le personnel d'après le texte saisi (« Client non présenté »…). */
export function motifDepuisTexte(texte: string | null | undefined): MotifRemboursement {
  return /non[- ]?pr[ée]sent|no[- ]?show|absent|ne s'est pas pr[ée]sent/i.test(texte ?? "") ? "NON_PRESENTATION" : "ANNULATION_HOTEL";
}

/**
 * Les acomptes payés en ligne à rendre (ou à garder) quand une réservation tombe à l'eau. Créé AUTOMATIQUEMENT à l'annulation ; c'est le PATRON
 * qui décide, jamais le système : une annulation tardive ou une non-présentation peuvent justifier de garder tout ou partie de l'acompte.
 * L'argent se rend depuis le compte ScanLinkPay de l'hôtel (Envoyer → numéro ScanLinkPay du client), ou en Mobile Money / espèces ; le patron
 * marque ensuite « remboursé ». La commission ScanLinkPay payée par le client n'est pas remboursée (elle appartient à ScanLinkPay).
 */
@Injectable()
export class RemboursementsService {
  private readonly logger = new Logger(RemboursementsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notifications: NotificationsService
  ) {}

  /**
   * À appeler dès qu'une réservation est annulée. Ne fait rien s'il n'y a pas d'acompte payé EN LIGNE, ni s'il y a déjà un remboursement
   * pour cette réservation (annuler deux fois ne crée pas deux dettes). Ne lève jamais : l'annulation, elle, a déjà eu lieu.
   */
  async creerSiAcompteEnLigne(reservationId: string, motif: MotifRemboursement): Promise<void> {
    try {
      const paiements = await this.prisma.paiementReservation.findMany({ where: { reservationId, statut: "REUSSI" }, orderBy: { createdAt: "asc" } });
      if (paiements.length === 0) return;
      if ((await this.prisma.remboursement.count({ where: { reservationId } })) > 0) return;
      const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId }, include: { client: true, chambre: true } });
      if (!reservation) return;
      const devise = paiements[0].devise;
      const total = arrondirDevise(paiements.reduce((somme, p) => somme + Number(p.montant), 0), devise);
      const slp = [...paiements].reverse().find((p) => p.numeroScanLinkPayClient)?.numeroScanLinkPayClient ?? null;
      await this.prisma.remboursement.create({
        data: {
          hotelId: reservation.hotelId,
          reservationId,
          paiementReservationId: paiements[paiements.length - 1].id,
          devise,
          montantPaye: total,
          montantARembourser: total,
          motif,
          destinataireScanLinkPay: slp,
          destinataireTelephone: reservation.client.telephone ?? null,
          clientNom: reservation.client.nom,
        },
      });
      void this.notifications.emettre({
        hotelId: reservation.hotelId,
        roles: [Role.PATRON],
        cleDedup: `remboursement:${reservationId}`,
        ...messages.remboursementAFaire({
          client: reservation.client.nom,
          montant: fmt(total, devise),
          motif: { ANNULATION_CLIENT: "annulation par le client", ANNULATION_HOTEL: "annulation par l'hôtel", NON_PRESENTATION: "client non présenté", CHAMBRE_INDISPONIBLE: "chambre devenue indisponible", AUTRE: "annulation" }[motif],
          reservationId,
        }),
      });
    } catch (e) {
      this.logger.error(`Remboursement non préparé pour la réservation ${reservationId} : ${(e as Error).message}`);
    }
  }

  private vue(r: any, reservation?: { dateArrivee: Date; chambre: { numero: string } } | null): RemboursementVue {
    return {
      id: r.id,
      reservationId: r.reservationId,
      clientNom: r.clientNom,
      chambreNumero: reservation?.chambre.numero ?? null,
      dateArrivee: reservation?.dateArrivee.toISOString() ?? null,
      devise: r.devise,
      montantPaye: Number(r.montantPaye),
      montantARembourser: Number(r.montantARembourser),
      motif: r.motif,
      statut: r.statut,
      mode: r.mode,
      destinataireScanLinkPay: r.destinataireScanLinkPay,
      destinataireTelephone: r.destinataireTelephone,
      reference: r.reference,
      note: r.note,
      traiteLe: r.traiteLe?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async lister(hotelId: string, statut?: string): Promise<RemboursementVue[]> {
    const lignes = await this.prisma.remboursement.findMany({
      where: { hotelId, ...(statut === "A_FAIRE" || statut === "EFFECTUE" || statut === "CONSERVE" ? { statut } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const reservations = await this.prisma.reservation.findMany({ where: { id: { in: lignes.map((l) => l.reservationId) }, hotelId }, include: { chambre: true } });
    const parId = new Map(reservations.map((r) => [r.id, r]));
    return lignes.map((l) => this.vue(l, parId.get(l.reservationId)));
  }

  async compterAFaire(hotelId: string): Promise<number> {
    return this.prisma.remboursement.count({ where: { hotelId, statut: "A_FAIRE" } });
  }

  async traiter(hotelId: string, id: string, dto: TraiterRemboursementDto, par: UtilisateurAuthentifie): Promise<RemboursementVue> {
    const ligne = await this.prisma.remboursement.findFirst({ where: { id, hotelId } });
    if (!ligne) throw new NotFoundException("Remboursement introuvable.");
    if (ligne.statut !== "A_FAIRE") throw new ConflictException("Ce remboursement a déjà été traité.");

    let montant = Number(ligne.montantARembourser);
    if (dto.action === "EFFECTUE") {
      if (dto.montant !== undefined) {
        montant = arrondirDevise(Number(dto.montant), ligne.devise);
        if (!Number.isFinite(montant) || montant <= 0) throw new BadRequestException("Le montant remboursé doit être supérieur à zéro.");
        if (montant > Number(ligne.montantPaye) + 1e-9) throw new BadRequestException("On ne peut pas rembourser plus que ce que le client a payé.");
      }
      if (!dto.mode) throw new BadRequestException("Indiquez comment vous avez remboursé (ScanLinkPay, Mobile Money ou espèces).");
    }
    // Décision prise une seule fois : si deux personnes cliquent en même temps, la seconde reçoit « déjà traité ».
    const resultat = await this.prisma.remboursement.updateMany({
      where: { id, hotelId, statut: "A_FAIRE" },
      data: {
        statut: dto.action,
        montantARembourser: dto.action === "CONSERVE" ? 0 : montant,
        mode: dto.action === "EFFECTUE" ? dto.mode : null,
        reference: dto.reference?.trim() || null,
        note: dto.note?.trim() || null,
        traiteParId: par.userId,
        traiteLe: new Date(),
      },
    });
    if (resultat.count === 0) throw new ConflictException("Ce remboursement a déjà été traité.");
    const maj = await this.prisma.remboursement.findUniqueOrThrow({ where: { id } });
    const reservation = await this.prisma.reservation.findUnique({ where: { id: maj.reservationId }, include: { chambre: true } });
    return this.vue(maj, reservation);
  }
}
