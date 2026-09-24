import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@hotel-chicago/database";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { CreateChambreDto } from "./dto/create-chambre.dto";
import { UpdateChambreDto } from "./dto/update-chambre.dto";
import { FindChambresQueryDto } from "./dto/find-chambres.query.dto";

/** Champs qu'un RECEPTIONNISTE n'a pas le droit de modifier (section 9.3 : "Chambres
 * (types, prix)" est réservé à PATRON, seul "Statut chambre" est ouvert aux deux). */
const CHAMPS_RESERVES_PATRON: (keyof UpdateChambreDto)[] = ["numero", "type", "prixParNuit", "devise"];

@Injectable()
export class ChambresService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  findAll(query: FindChambresQueryDto) {
    return this.prisma.chambre.findMany({
      where: {
        statut: query.statut,
        type: query.type,
      },
      orderBy: { numero: "asc" },
    });
  }

  async findOne(id: string) {
    const chambre = await this.prisma.chambre.findUnique({ where: { id } });
    if (!chambre) {
      throw new NotFoundException(`Aucune chambre trouvée avec l'identifiant ${id}.`);
    }
    return chambre;
  }

  async create(dto: CreateChambreDto) {
    try {
      return await this.prisma.chambre.create({ data: dto });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(`Une chambre avec le numéro "${dto.numero}" existe déjà.`);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateChambreDto, currentUser: UtilisateurAuthentifie) {
    await this.findOne(id);

    if (currentUser.role === Role.RECEPTIONNISTE) {
      const champsRefuses = CHAMPS_RESERVES_PATRON.filter((champ) => dto[champ] !== undefined);
      if (champsRefuses.length > 0) {
        throw new ForbiddenException(
          `Un réceptionniste ne peut modifier que le statut ou les photos d'une chambre, ` +
            `pas : ${champsRefuses.join(", ")}. Seul le patron peut changer le prix ou le type d'une chambre.`
        );
      }
    }

    try {
      // syncVersion incrémenté manuellement à CHAQUE update : c'est la seule
      // façon pour un appareil hors ligne (Phase 4) de détecter qu'une ligne a
      // changé depuis sa dernière lecture. Sans cet incrément, syncVersion
      // resterait figé à 1 pour toujours et la détection de conflit ne
      // détecterait jamais rien.
      return await this.prisma.chambre.update({
        where: { id },
        data: { ...dto, syncVersion: { increment: 1 } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(`Une chambre avec le numéro "${dto.numero}" existe déjà.`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      await this.prisma.chambre.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new ConflictException(
          "Impossible de supprimer cette chambre : elle a des réservations associées " +
            "(l'historique des séjours et des factures doit être conservé)."
        );
      }
      throw error;
    }
  }
}
