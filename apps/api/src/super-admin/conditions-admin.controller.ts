import { Body, ConflictException, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { Prisma, PrismaClient } from "@hotel-chicago/database";
import { SuperAdminAuthentifie } from "@hotel-chicago/types";
import { SuperAdminAuthGuard } from "../common/guards/super-admin-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PRISMA } from "../prisma/prisma.module";
import { PublierConditionsDto } from "./dto/publier-conditions.dto";

/**
 * Conditions d'utilisation (19/10/2026) : le super-admin publie le texte ; chaque publication crée une NOUVELLE version
 * (les anciennes restent : on sait ce que chaque hôtel a accepté). Les inscriptions suivantes doivent accepter la dernière.
 */
@Controller("super-admin/conditions")
@UseGuards(SuperAdminAuthGuard)
export class ConditionsAdminController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Toutes les versions, la plus récente d'abord, avec le nombre d'hôtels qui ont accepté chacune. */
  @Get()
  async lister() {
    const [versions, acceptations] = await Promise.all([
      this.prisma.conditionsUtilisation.findMany({ orderBy: { version: "desc" } }),
      this.prisma.hotel.groupBy({ by: ["conditionsVersion"], _count: { _all: true }, where: { conditionsVersion: { not: null } } }),
    ]);
    const parVersion = new Map(acceptations.map((a) => [a.conditionsVersion, a._count._all]));
    return versions.map((v) => ({ ...v, hotelsAyantAccepte: parVersion.get(v.version) ?? 0 }));
  }

  @Post()
  async publier(@Body() dto: PublierConditionsDto, @CurrentUser() superAdmin: SuperAdminAuthentifie) {
    const derniere = await this.prisma.conditionsUtilisation.findFirst({ orderBy: { version: "desc" }, select: { version: true, texte: true } });
    const texte = dto.texte.replace(/\r\n/g, "\n").trim();
    if (derniere && derniere.texte.trim() === texte) throw new ConflictException("Ce texte est identique à la version en vigueur : rien à publier.");
    try {
      return await this.prisma.conditionsUtilisation.create({
        data: { version: (derniere?.version ?? 0) + 1, texte, publiePar: superAdmin.id },
      });
    } catch (e) {
      // Deux publications au même instant : le numéro de version est unique, la seconde est refusée.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("Une autre version vient d'être publiée : rechargez la page.");
      }
      throw e;
    }
  }
}
