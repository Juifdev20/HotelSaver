import { Inject, Injectable } from "@nestjs/common";
import { PrismaClient } from "@hotel-chicago/database";
import { PRISMA } from "../prisma/prisma.module";
import { ModifierReglagesDto } from "./dto/modifier-reglages.dto";

@Injectable()
export class ReglagesHotelService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Réglages propres à CET hôtel (le `hotelId` vient du jeton, jamais du client). */
  async modifier(hotelId: string, dto: ModifierReglagesDto): Promise<{ patronPeutOperer: boolean }> {
    const hotel = await this.prisma.hotel.update({
      where: { id: hotelId },
      data: { patronPeutOperer: dto.patronPeutOperer },
      select: { patronPeutOperer: true },
    });
    return { patronPeutOperer: hotel.patronPeutOperer };
  }
}
