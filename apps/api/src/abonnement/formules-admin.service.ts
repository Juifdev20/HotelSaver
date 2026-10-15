import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@hotel-chicago/database";
import { PRISMA } from "../prisma/prisma.module";
import { invaliderCatalogue, lireCatalogue } from "../common/abonnement/catalogue";
import { ChangerFormuleHotelDto, CreerFormuleDto, ModifierFormuleDto, ModifierParametresDto } from "./dto/formule.dto";

/** Administration des formules et des réglages d'abonnement par le SUPER-ADMIN (écran « Abonnements » du super-admin). */
@Injectable()
export class FormulesAdminService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  private vue(l: Prisma.FormuleAbonnementGetPayload<object>, hotelsAbonnes: number) {
    return {
      id: l.id,
      code: l.code,
      nom: l.nom,
      description: l.description,
      prixMensuelUsd: Number(l.prixMensuelUsd),
      maxChambres: l.maxChambres,
      fonctions: l.fonctions,
      avantages: l.avantages,
      recommandee: l.recommandee,
      actif: l.actif,
      ordre: l.ordre,
      hotelsAbonnes,
    };
  }

  async lister() {
    const [lignes, usages] = await Promise.all([
      this.prisma.formuleAbonnement.findMany({ orderBy: [{ ordre: "asc" }, { prixMensuelUsd: "asc" }] }),
      this.prisma.hotel.groupBy({ by: ["formule"], _count: { _all: true }, where: { formule: { not: null } } }),
    ]);
    const parCode = new Map(usages.map((u) => [u.formule, u._count._all]));
    return lignes.map((l) => this.vue(l, parCode.get(l.code) ?? 0));
  }

  async creer(dto: CreerFormuleDto) {
    try {
      const cree = await this.prisma.$transaction(async (tx) => {
        if (dto.recommandee) await tx.formuleAbonnement.updateMany({ data: { recommandee: false } });
        return tx.formuleAbonnement.create({
          data: {
            code: dto.code,
            nom: dto.nom.trim(),
            description: dto.description?.trim() ?? "",
            prixMensuelUsd: dto.prixMensuelUsd,
            maxChambres: dto.maxChambres ?? null,
            fonctions: [...new Set(dto.fonctions)],
            avantages: (dto.avantages ?? []).map((a) => a.trim()).filter(Boolean),
            recommandee: dto.recommandee ?? false,
            actif: dto.actif ?? true,
            ordre: dto.ordre ?? 100,
          },
        });
      });
      invaliderCatalogue();
      return this.vue(cree, 0);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ConflictException(`Une formule « ${dto.code} » existe déjà.`);
      throw e;
    }
  }

  async modifier(code: string, dto: ModifierFormuleDto) {
    const existante = await this.prisma.formuleAbonnement.findUnique({ where: { code } });
    if (!existante) throw new NotFoundException("Formule introuvable.");
    if (dto.actif === false && existante.actif) {
      const autres = await this.prisma.formuleAbonnement.count({ where: { actif: true, code: { not: code } } });
      if (autres === 0) throw new BadRequestException("Il faut garder au moins une formule proposée à l'achat.");
    }
    const maj = await this.prisma.$transaction(async (tx) => {
      if (dto.recommandee) await tx.formuleAbonnement.updateMany({ where: { code: { not: code } }, data: { recommandee: false } });
      return tx.formuleAbonnement.update({
        where: { code },
        data: {
          ...(dto.nom !== undefined && { nom: dto.nom.trim() }),
          ...(dto.description !== undefined && { description: dto.description.trim() }),
          ...(dto.prixMensuelUsd !== undefined && { prixMensuelUsd: dto.prixMensuelUsd }),
          ...(dto.maxChambres !== undefined && { maxChambres: dto.maxChambres }),
          ...(dto.fonctions !== undefined && { fonctions: [...new Set(dto.fonctions)] }),
          ...(dto.avantages !== undefined && { avantages: dto.avantages.map((a) => a.trim()).filter(Boolean) }),
          ...(dto.recommandee !== undefined && { recommandee: dto.recommandee }),
          ...(dto.actif !== undefined && { actif: dto.actif }),
          ...(dto.ordre !== undefined && { ordre: dto.ordre }),
        },
      });
    });
    invaliderCatalogue();
    return this.vue(maj, await this.prisma.hotel.count({ where: { formule: code } }));
  }

  async supprimer(code: string) {
    const existante = await this.prisma.formuleAbonnement.findUnique({ where: { code } });
    if (!existante) throw new NotFoundException("Formule introuvable.");
    const abonnes = await this.prisma.hotel.count({ where: { formule: code } });
    if (abonnes > 0) throw new ConflictException(`${abonnes} hôtel(s) ont cette formule : désactivez-la (elle ne sera plus proposée) au lieu de la supprimer.`);
    const dejaPayee = await this.prisma.paiementAbonnement.count({ where: { formule: code } });
    if (dejaPayee > 0) throw new ConflictException("Cette formule apparaît dans des paiements : désactivez-la au lieu de la supprimer.");
    if (existante.actif && (await this.prisma.formuleAbonnement.count({ where: { actif: true, code: { not: code } } })) === 0) {
      throw new BadRequestException("Il faut garder au moins une formule proposée à l'achat.");
    }
    await this.prisma.formuleAbonnement.delete({ where: { code } });
    invaliderCatalogue();
    return { ok: true };
  }

  async lireParametres() {
    const { parametres } = await lireCatalogue(this.prisma, 0);
    return parametres;
  }

  async modifierParametres(dto: ModifierParametresDto) {
    await this.prisma.parametresPlateforme.upsert({
      where: { id: "plateforme" },
      update: { ...dto, ...(dto.fonctionsEssai !== undefined && { fonctionsEssai: [...new Set(dto.fonctionsEssai)] }) },
      create: { id: "plateforme", fonctionsEssai: dto.fonctionsEssai ?? ["RECEPTION", "CAFETERIA", "SITE_PUBLIC", "DOMAINE_PERSONNALISE", "ACOMPTE_EN_LIGNE"], ...dto },
    });
    invaliderCatalogue();
    return this.lireParametres();
  }

  /** Attribue (ou retire) la formule d'un hôtel sans paiement — pour un hôtel créé à la main ou un geste commercial. */
  async changerFormuleHotel(hotelId: string, dto: ChangerFormuleHotelDto) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) throw new NotFoundException("Hôtel introuvable.");
    if (dto.formule !== null && !(await this.prisma.formuleAbonnement.findUnique({ where: { code: dto.formule } }))) {
      throw new BadRequestException("Formule inconnue.");
    }
    const maj = await this.prisma.hotel.update({ where: { id: hotelId }, data: { formule: dto.formule } });
    return { id: maj.id, formule: maj.formule };
  }
}
