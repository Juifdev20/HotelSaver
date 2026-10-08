import { Inject, Injectable } from "@nestjs/common";
import { PrismaClient, StatutLigne } from "@hotel-chicago/database";
import { PRISMA } from "../prisma/prisma.module";
import { ModifierReglagesDto } from "./dto/modifier-reglages.dto";

@Injectable()
export class ReglagesHotelService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Réglages propres à CET hôtel (le `hotelId` vient du jeton, jamais du client).
   * Désactiver la cuisine clot proprement les lignes encore en file (sinon elles
   * resteraient EN_ATTENTE/PRET à jamais, réapparaissant si on la réactive). */
  async modifier(hotelId: string, dto: ModifierReglagesDto): Promise<{ patronPeutOperer: boolean; cuisineActivee: boolean; commandeWebActivee: boolean }> {
    const data: { patronPeutOperer?: boolean; cuisineActivee?: boolean; commandeWebActivee?: boolean } = {};
    if (dto.patronPeutOperer !== undefined) data.patronPeutOperer = dto.patronPeutOperer;
    if (dto.cuisineActivee !== undefined) data.cuisineActivee = dto.cuisineActivee;
    if (dto.commandeWebActivee !== undefined) data.commandeWebActivee = dto.commandeWebActivee;

    const hotel = await this.prisma.hotel.update({
      where: { id: hotelId },
      data,
      select: { patronPeutOperer: true, cuisineActivee: true, commandeWebActivee: true },
    });

    if (dto.cuisineActivee === false) {
      await this.prisma.ligneCommande.updateMany({
        where: { hotelId, statut: { in: [StatutLigne.EN_ATTENTE, StatutLigne.EN_PREPARATION, StatutLigne.PRET] } },
        data: { statut: StatutLigne.SERVI },
      });
    }

    return { patronPeutOperer: hotel.patronPeutOperer, cuisineActivee: hotel.cuisineActivee, commandeWebActivee: hotel.commandeWebActivee };
  }
}
