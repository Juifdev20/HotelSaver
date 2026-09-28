import { Inject, Injectable } from "@nestjs/common";
import { PrismaClient } from "@hotel-chicago/database";
import { UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { CreateTauxChangeDto } from "./dto/create-taux-change.dto";

@Injectable()
export class TauxChangeService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Le taux du jour en vigueur : la ligne la plus récente de l'hôtel, ou
   * null tant que le patron n'en a jamais saisi un (l'écran d'encaissement
   * doit le savoir pour désactiver le paiement croisé proprement). */
  actuel(hotelId: string) {
    return this.prisma.tauxChange.findFirst({ where: { hotelId }, orderBy: { createdAt: "desc" } });
  }

  /** Historique des taux saisis, du plus récent au plus ancien. */
  historique(hotelId: string) {
    return this.prisma.tauxChange.findMany({ where: { hotelId }, orderBy: { createdAt: "desc" }, take: 50 });
  }

  /** Chaque saisie crée une nouvelle ligne — jamais un update : les factures
   * passées ont copié `tauxChangeApplique` au moment de l'encaissement et la
   * trace du taux utilisé ce jour-là doit rester intacte (section 9.4). */
  create(dto: CreateTauxChangeDto, currentUser: UtilisateurAuthentifie) {
    return this.prisma.tauxChange.create({
      data: { hotelId: currentUser.hotelId, cdfParUsd: dto.cdfParUsd, definiPar: currentUser.userId },
    });
  }
}
