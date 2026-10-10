import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ModifierClientDto } from "./dto/modifier-client.dto";
import { PrismaClient } from "@hotel-chicago/database";
import { PRISMA } from "../prisma/prisma.module";

@Injectable()
export class ClientsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Répertoire des clients de l'hôtel, filtrable par nom ou téléphone —
   * sert au picker « client existant » du formulaire de réservation et à la
   * fiche client (historique des séjours via `reservations`). */
  findAll(hotelId: string, q?: string) {
    const terme = q?.trim();
    return this.prisma.client.findMany({
      take: 1000, // Plafond de sécurité : une liste n'est jamais illimitée (déni de service, mémoire).
      where: {
        hotelId,
        ...(terme
          ? {
              OR: [
                { nom: { contains: terme, mode: "insensitive" } },
                { telephone: { contains: terme } },
              ],
            }
          : {}),
      },
      include: {
        reservations: {
          orderBy: { dateArrivee: "desc" },
          include: { chambre: true, facture: true },
        },
      },
      orderBy: { nom: "asc" },
    });
  }

  async findOne(id: string, hotelId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id, hotelId },
      include: {
        reservations: {
          orderBy: { dateArrivee: "desc" },
          include: { chambre: true, facture: true },
        },
      },
    });
    if (!client) {
      throw new NotFoundException(`Aucun client trouvé avec l'identifiant ${id}.`);
    }
    return client;
  }

  /** Fiche client (pièce d'identité, notes, coordonnées) — syncVersion
   * incrémenté comme partout pour la détection de conflit hors ligne. */
  async update(id: string, dto: ModifierClientDto, hotelId: string) {
    await this.findOne(id, hotelId);
    return this.prisma.client.update({
      where: { id, hotelId },
      data: { ...dto, syncVersion: { increment: 1 } },
      include: {
        reservations: {
          orderBy: { dateArrivee: "desc" },
          include: { chambre: true, facture: true },
        },
      },
    });
  }
}
