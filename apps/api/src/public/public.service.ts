import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaClient, StatutChambre } from "@hotel-chicago/database";
import { PRISMA } from "../prisma/prisma.module";
import { CreerDemandeReservationDto } from "./dto/creer-demande-reservation.dto";
import { FindChambresDisponiblesQueryDto } from "./dto/find-chambres-disponibles.query.dto";

/** Réservations qui bloquent réellement une chambre (voir ReservationsService —
 * dupliqué ici volontairement : ce service public ne doit dépendre d'aucun
 * état interne du module Réservations, juste de la base). */
const STATUTS_OCCUPANTS = ["CONFIRMEE", "EN_COURS"] as const;

/** Utilisateur.id n'existe pas pour un visiteur anonyme du site public ; comme
 * Reservation.createdBy est un simple champ String (pas une relation Prisma
 * vers Utilisateur), cette valeur sentinelle documente l'origine sans avoir
 * besoin de rendre la colonne nullable ni de créer un utilisateur factice. */
const CREATED_BY_SITE_PUBLIC = "SITE_PUBLIC";

@Injectable()
export class PublicService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async findChambresDisponibles(query: FindChambresDisponiblesQueryDto) {
    if (!query.dateArrivee || !query.dateDepart) {
      return this.prisma.chambre.findMany({ where: { statut: StatutChambre.LIBRE }, orderBy: { numero: "asc" } });
    }

    const dateArrivee = new Date(query.dateArrivee);
    const dateDepart = new Date(query.dateDepart);
    if (dateArrivee >= dateDepart) {
      throw new BadRequestException("La date de départ doit être postérieure à la date d'arrivée.");
    }

    const chambresOccupees = await this.prisma.reservation.findMany({
      where: {
        statut: { in: [...STATUTS_OCCUPANTS] },
        dateArrivee: { lt: dateDepart },
        dateDepart: { gt: dateArrivee },
      },
      select: { chambreId: true },
    });
    const idsOccupees = chambresOccupees.map((r) => r.chambreId);

    return this.prisma.chambre.findMany({
      where: { id: { notIn: idsOccupees } },
      orderBy: { numero: "asc" },
    });
  }

  findMenu() {
    return this.prisma.produit.findMany({
      where: { actif: true },
      orderBy: [{ categorie: "asc" }, { nom: "asc" }],
    });
  }

  async creerDemandeReservation(dto: CreerDemandeReservationDto) {
    const chambre = await this.prisma.chambre.findUnique({ where: { id: dto.chambreId } });
    if (!chambre) {
      throw new NotFoundException(`Aucune chambre trouvée avec l'identifiant ${dto.chambreId}.`);
    }

    const dateArrivee = new Date(dto.dateArrivee);
    const dateDepart = new Date(dto.dateDepart);
    if (dateArrivee >= dateDepart) {
      throw new BadRequestException("La date de départ doit être postérieure à la date d'arrivée.");
    }

    // Une demande EN_ATTENTE n'occupe pas la chambre (voir ReservationsService) :
    // plusieurs demandes peuvent chevaucher la même période, à arbitrer par la
    // réception. Pas de vérification de conflit ici, volontairement.

    const client = dto.client.telephone
      ? ((await this.prisma.client.findFirst({ where: { telephone: dto.client.telephone } })) ??
          (await this.prisma.client.create({ data: dto.client })))
      : await this.prisma.client.create({ data: dto.client });

    return this.prisma.reservation.create({
      data: {
        chambreId: dto.chambreId,
        clientId: client.id,
        dateArrivee,
        dateDepart,
        statut: "EN_ATTENTE",
        origine: "SITE_PUBLIC",
        createdBy: CREATED_BY_SITE_PUBLIC,
      },
      include: { chambre: true, client: true },
    });
  }
}
