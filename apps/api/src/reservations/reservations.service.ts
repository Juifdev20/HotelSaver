import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaClient, StatutChambre } from "@hotel-chicago/database";
import { UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { UpdateReservationDto } from "./dto/update-reservation.dto";
import { AnnulerReservationDto } from "./dto/annuler-reservation.dto";
import { FindReservationsQueryDto } from "./dto/find-reservations.query.dto";

/** Réservations qui bloquent réellement une chambre pour une période donnée. */
const STATUTS_OCCUPANTS = ["CONFIRMEE", "EN_COURS"] as const;

@Injectable()
export class ReservationsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  findAll(query: FindReservationsQueryDto, hotelId: string) {
    return this.prisma.reservation.findMany({
      where: { hotelId, statut: query.statut, chambreId: query.chambreId },
      include: { chambre: true, client: true, facture: true },
      orderBy: { dateArrivee: "desc" },
    });
  }

  async findOne(id: string, hotelId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id, hotelId },
      include: { chambre: true, client: true, facture: true },
    });
    if (!reservation) {
      throw new NotFoundException(`Aucune réservation trouvée avec l'identifiant ${id}.`);
    }
    return reservation;
  }

  async create(dto: CreateReservationDto, currentUser: UtilisateurAuthentifie) {
    if (Boolean(dto.clientId) === Boolean(dto.client)) {
      throw new BadRequestException(
        "Fournir soit clientId (client existant), soit client (nouveau client), jamais les deux ni aucun des deux."
      );
    }

    const dateArrivee = new Date(dto.dateArrivee);
    const dateDepart = new Date(dto.dateDepart);
    if (dateArrivee >= dateDepart) {
      throw new BadRequestException("La date de départ doit être postérieure à la date d'arrivée.");
    }

    const chambre = await this.prisma.chambre.findUnique({ where: { id: dto.chambreId, hotelId: currentUser.hotelId } });
    if (!chambre) {
      throw new NotFoundException(`Aucune chambre trouvée avec l'identifiant ${dto.chambreId}.`);
    }

    if (dto.clientId) {
      const client = await this.prisma.client.findUnique({ where: { id: dto.clientId, hotelId: currentUser.hotelId } });
      if (!client) {
        throw new NotFoundException(`Aucun client trouvé avec l'identifiant ${dto.clientId}.`);
      }
    }

    await this.verifierAbsenceDeConflit(dto.chambreId, dateArrivee, dateDepart, currentUser.hotelId);

    const clientId =
      dto.clientId ?? (await this.prisma.client.create({ data: { ...dto.client!, hotelId: currentUser.hotelId } })).id;

    return this.prisma.reservation.create({
      data: {
        hotelId: currentUser.hotelId,
        chambreId: dto.chambreId,
        clientId,
        dateArrivee,
        dateDepart,
        acompte: dto.acompte ?? 0,
        statut: "CONFIRMEE",
        origine: "RECEPTION",
        createdBy: currentUser.userId,
      },
      include: { chambre: true, client: true },
    });
  }

  async update(id: string, dto: UpdateReservationDto, hotelId: string) {
    const reservation = await this.findOne(id, hotelId);
    if (reservation.statut === "ANNULEE" || reservation.statut === "TERMINEE") {
      throw new ConflictException(
        `Impossible de modifier une réservation ${reservation.statut === "ANNULEE" ? "annulée" : "déjà terminée"}.`
      );
    }

    const dateArrivee = dto.dateArrivee ? new Date(dto.dateArrivee) : reservation.dateArrivee;
    const dateDepart = dto.dateDepart ? new Date(dto.dateDepart) : reservation.dateDepart;
    if (dateArrivee >= dateDepart) {
      throw new BadRequestException("La date de départ doit être postérieure à la date d'arrivée.");
    }

    if (dto.dateArrivee || dto.dateDepart) {
      await this.verifierAbsenceDeConflit(reservation.chambreId, dateArrivee, dateDepart, hotelId, id);
    }

    // syncVersion incrémenté manuellement partout dans ce service (voir
    // ChambresService.update pour le détail) — indispensable pour la
    // détection de conflit hors ligne (Phase 4).
    return this.prisma.reservation.update({
      where: { id, hotelId },
      data: { dateArrivee, dateDepart, acompte: dto.acompte, syncVersion: { increment: 1 } },
      include: { chambre: true, client: true },
    });
  }

  async annuler(id: string, dto: AnnulerReservationDto, hotelId: string) {
    const reservation = await this.findOne(id, hotelId);
    if (reservation.statut === "ANNULEE") {
      throw new ConflictException("Cette réservation est déjà annulée.");
    }
    if (reservation.statut === "TERMINEE") {
      throw new ConflictException("Impossible d'annuler une réservation déjà terminée.");
    }

    return this.prisma.reservation.update({
      where: { id, hotelId },
      data: { statut: "ANNULEE", annuleLe: new Date(), motifAnnulation: dto.motif, syncVersion: { increment: 1 } },
    });
  }

  async checkIn(id: string, hotelId: string) {
    const reservation = await this.findOne(id, hotelId);
    if (reservation.statut !== "CONFIRMEE") {
      throw new ConflictException(
        `Cette réservation ne peut pas être enregistrée en arrivée (statut actuel : ${reservation.statut}). ` +
          "Seule une réservation CONFIRMEE peut faire l'objet d'un check-in."
      );
    }

    const [, chambre] = await this.prisma.$transaction([
      this.prisma.reservation.update({
        where: { id, hotelId },
        data: { statut: "EN_COURS", syncVersion: { increment: 1 } },
      }),
      this.prisma.chambre.update({
        where: { id: reservation.chambreId, hotelId },
        data: { statut: StatutChambre.OCCUPEE, syncVersion: { increment: 1 } },
      }),
    ]);

    return { reservationId: id, statutReservation: "EN_COURS", chambre };
  }

  async checkOut(id: string, hotelId: string) {
    const reservation = await this.findOne(id, hotelId);
    if (reservation.statut !== "EN_COURS") {
      throw new ConflictException(
        `Cette réservation ne peut pas être enregistrée en départ (statut actuel : ${reservation.statut}). ` +
          "Seule une réservation EN_COURS (client déjà arrivé) peut faire l'objet d'un check-out."
      );
    }

    const [, chambre] = await this.prisma.$transaction([
      this.prisma.reservation.update({
        where: { id, hotelId },
        data: { statut: "TERMINEE", syncVersion: { increment: 1 } },
      }),
      this.prisma.chambre.update({
        where: { id: reservation.chambreId, hotelId },
        data: { statut: StatutChambre.NETTOYAGE, syncVersion: { increment: 1 } },
      }),
    ]);

    return { reservationId: id, statutReservation: "TERMINEE", chambre };
  }

  /** Empêche deux réservations actives de se chevaucher sur la même chambre. */
  private async verifierAbsenceDeConflit(
    chambreId: string,
    dateArrivee: Date,
    dateDepart: Date,
    hotelId: string,
    exclureReservationId?: string
  ) {
    const conflit = await this.prisma.reservation.findFirst({
      where: {
        hotelId,
        chambreId,
        id: exclureReservationId ? { not: exclureReservationId } : undefined,
        statut: { in: [...STATUTS_OCCUPANTS] },
        dateArrivee: { lt: dateDepart },
        dateDepart: { gt: dateArrivee },
      },
    });

    if (conflit) {
      throw new ConflictException(
        "Cette chambre est déjà réservée sur une partie de cette période. " +
          "Choisissez d'autres dates ou une autre chambre."
      );
    }
  }
}
