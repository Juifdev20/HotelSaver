import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaClient, StatutChambre } from "@hotel-chicago/database";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { messages } from "../notifications/messages";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { UpdateReservationDto } from "./dto/update-reservation.dto";
import { sansChevauchement } from "../common/chevauchement";
import { acompteMaximal, MESSAGE_ACOMPTE_TROP_ELEVE } from "@hotel-chicago/regles";
import { AnnulerReservationDto } from "./dto/annuler-reservation.dto";
import { FindReservationsQueryDto } from "./dto/find-reservations.query.dto";

/** Réservations qui bloquent réellement une chambre pour une période donnée. */
const STATUTS_OCCUPANTS = ["CONFIRMEE", "EN_COURS"] as const;

/** « 120.00 USD » / « 280000 CDF » pour un message de notification. */
function montantLisible(valeur: number, devise: string): string {
  return devise === "CDF" ? `${Math.round(valeur)} CDF` : `${valeur.toFixed(2)} ${devise}`;
}

@Injectable()
export class ReservationsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notifications: NotificationsService
  ) {}

  findAll(query: FindReservationsQueryDto, hotelId: string) {
    // Plage [du, au) = vue planning : réservations qui chevauchent la fenêtre.
    // Par défaut sur une plage on exclut les ANNULEE (elles n'occupent plus
    // la chambre) sauf si statut est demandé explicitement.
    const plage = query.du && query.au;
    return this.prisma.reservation.findMany({
      take: 2000, // Plafond de sécurité : une liste n'est jamais illimitée (déni de service, mémoire).
      where: {
        hotelId,
        statut: query.statut ?? (plage ? { not: "ANNULEE" } : undefined),
        chambreId: query.chambreId,
        ...(plage
          ? {
              dateArrivee: { lt: new Date(query.au!) },
              dateDepart: { gt: new Date(query.du!) },
            }
          : {}),
      },
      include: { chambre: true, client: true, facture: true },
      orderBy: { dateArrivee: plage ? "asc" : "desc" },
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
    this.verifierAcompte(dto.acompte, chambre.prixParNuit, dateArrivee, dateDepart);

    const clientId =
      dto.clientId ?? (await this.prisma.client.create({ data: { ...dto.client!, hotelId: currentUser.hotelId } })).id;

    // Arrivée express (walk-in) : le client est au comptoir — la réservation
    // naît directement EN_COURS et la chambre passe OCCUPEE dans la même
    // transaction, au lieu du cycle CONFIRMEE → check-in séparé.
    const statut = dto.installerImmediatement ? "EN_COURS" : "CONFIRMEE";
    const [reservation] = await sansChevauchement(() => this.prisma.$transaction([
      this.prisma.reservation.create({
        data: {
          hotelId: currentUser.hotelId,
          chambreId: dto.chambreId,
          clientId,
          dateArrivee,
          dateDepart,
          acompte: dto.acompte ?? 0,
          note: dto.note,
          statut,
          origine: "RECEPTION",
          createdBy: currentUser.userId,
        },
        include: { chambre: true, client: true },
      }),
      ...(dto.installerImmediatement
        ? [
            this.prisma.chambre.update({
              where: { id: dto.chambreId, hotelId: currentUser.hotelId },
              data: { statut: StatutChambre.OCCUPEE, syncVersion: { increment: 1 } },
            }),
          ]
        : []),
    ]));
    return reservation;
  }

  async update(id: string, dto: UpdateReservationDto, hotelId: string, par?: UtilisateurAuthentifie) {
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
    // Contrôlé à chaque changement d'acompte ou de dates (jamais sur une simple note, pour ne pas bloquer un ancien séjour déjà au-dessus).
    if (reservation.chambre && (dto.acompte !== undefined || dto.dateArrivee || dto.dateDepart)) {
      this.verifierAcompte(dto.acompte ?? Number(reservation.acompte), reservation.chambre.prixParNuit, dateArrivee, dateDepart);
    }

    // syncVersion incrémenté manuellement partout dans ce service (voir
    // ChambresService.update pour le détail) — indispensable pour la
    // détection de conflit hors ligne (Phase 4).
    const misAJour = await sansChevauchement(() =>
      this.prisma.reservation.update({
        where: { id, hotelId },
        data: {
          dateArrivee,
          dateDepart,
          acompte: dto.acompte,
          note: dto.note,
          reponseReception: dto.reponseReception,
          syncVersion: { increment: 1 },
        },
        include: { chambre: true, client: true },
      })
    );
    // L'acompte est l'argent le plus facile à détourner (il se soustrait de la facture) : toute modification est signalée au patron.
    if (dto.acompte !== undefined && Number(reservation.acompte) !== dto.acompte && par) {
      void this.notifications.emettre({
        hotelId,
        roles: [Role.PATRON],
        ...messages.acompteModifie({
          client: misAJour.client?.nom ?? "Client",
          chambre: misAJour.chambre.numero,
          ancien: montantLisible(Number(reservation.acompte), misAJour.chambre.devise),
          nouveau: montantLisible(dto.acompte, misAJour.chambre.devise),
          par: par.nom,
          reservationId: id,
        }),
      });
    }
    return misAJour;
  }

  /** `par` = l'utilisateur qui annule : le patron est prévenu des annulations faites par son équipe (pas des siennes). */
  async annuler(id: string, dto: AnnulerReservationDto, hotelId: string, par?: UtilisateurAuthentifie) {
    const reservation = await this.findOne(id, hotelId);
    if (reservation.statut === "ANNULEE") {
      throw new ConflictException("Cette réservation est déjà annulée.");
    }
    if (reservation.statut === "TERMINEE") {
      throw new ConflictException("Impossible d'annuler une réservation déjà terminée.");
    }

    const annulee = await this.prisma.reservation.update({
      where: { id, hotelId },
      data: { statut: "ANNULEE", annuleLe: new Date(), motifAnnulation: dto.motif, syncVersion: { increment: 1 } },
    });

    if (par?.role !== Role.PATRON) {
      void this.notifications.emettre({
        hotelId,
        roles: [Role.PATRON],
        ...messages.reservationAnnulee({
          client: reservation.client?.nom ?? "Client",
          chambre: reservation.chambre?.numero ?? "?",
          motif: dto.motif,
          reservationId: id,
          par: par?.nom,
        }),
      });
    }
    return annulee;
  }

  /** Valide une demande venue du site public (EN_ATTENTE → CONFIRMEE). Une
   * demande EN_ATTENTE ne bloque pas la chambre (voir STATUTS_OCCUPANTS) : le
   * contrôle de chevauchement ne peut donc se faire qu'ici, au moment de la
   * confirmation, jamais à la création de la demande. */
  async confirmer(id: string, hotelId: string) {
    const reservation = await this.findOne(id, hotelId);
    if (reservation.statut !== "EN_ATTENTE") {
      throw new ConflictException(
        `Cette réservation ne peut pas être confirmée (statut actuel : ${reservation.statut}). ` +
          "Seule une demande EN_ATTENTE peut être validée."
      );
    }

    await this.verifierAbsenceDeConflit(
      reservation.chambreId,
      reservation.dateArrivee,
      reservation.dateDepart,
      hotelId,
      id
    );

    return sansChevauchement(() =>
      this.prisma.reservation.update({
        where: { id, hotelId },
        data: { statut: "CONFIRMEE", syncVersion: { increment: 1 } },
        include: { chambre: true, client: true },
      })
    );
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

    // Dédoublonné par réservation : un check-out rejoué ne ré-alerte pas.
    void this.notifications.emettre({
      hotelId,
      roles: [Role.RECEPTIONNISTE, Role.PATRON],
      cleDedup: `preparer:${id}`,
      ...messages.chambreAPreparer({ chambre: chambre.numero, chambreId: chambre.id }),
    });
    return { reservationId: id, statutReservation: "TERMINEE", chambre };
  }

  /** Empêche deux réservations actives de se chevaucher sur la même chambre. */
  /** L'acompte ne dépasse jamais le prix du séjour (règle partagée avec les appareils : `packages/regles`). */
  private verifierAcompte(acompte: number | undefined, prixParNuit: unknown, dateArrivee: Date, dateDepart: Date) {
    if (acompte === undefined) return;
    if (acompte > acompteMaximal(Number(prixParNuit), dateArrivee, dateDepart) + 0.005) {
      throw new BadRequestException(MESSAGE_ACOMPTE_TROP_ELEVE);
    }
  }

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
