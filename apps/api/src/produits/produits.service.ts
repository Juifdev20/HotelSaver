import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@hotel-chicago/database";
import { PRISMA } from "../prisma/prisma.module";
import { CreateProduitDto } from "./dto/create-produit.dto";
import { UpdateProduitDto } from "./dto/update-produit.dto";
import { FindProduitsQueryDto } from "./dto/find-produits.query.dto";

@Injectable()
export class ProduitsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  findAll(query: FindProduitsQueryDto) {
    return this.prisma.produit.findMany({
      where: { categorie: query.categorie, actif: query.actif },
      orderBy: [{ categorie: "asc" }, { nom: "asc" }],
    });
  }

  async findOne(id: string) {
    const produit = await this.prisma.produit.findUnique({ where: { id } });
    if (!produit) {
      throw new NotFoundException(`Aucun produit trouvé avec l'identifiant ${id}.`);
    }
    return produit;
  }

  create(dto: CreateProduitDto) {
    return this.prisma.produit.create({ data: { ...dto, stockActuel: dto.stockActuel ?? 0 } });
  }

  async update(id: string, dto: UpdateProduitDto) {
    await this.findOne(id);
    // syncVersion incrémenté manuellement (voir ChambresService.update pour le
    // détail complet) — indispensable pour la détection de conflit hors ligne.
    return this.prisma.produit.update({
      where: { id },
      data: { ...dto, syncVersion: { increment: 1 } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      await this.prisma.produit.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new ConflictException(
          "Impossible de supprimer ce produit : il a un historique de mouvements de stock ou de commandes. " +
            "Désactivez-le plutôt (actif = false)."
        );
      }
      throw error;
    }
  }
}
