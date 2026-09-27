import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@hotel-chicago/database";
import { PRISMA } from "../prisma/prisma.module";
import { CreateProduitDto } from "./dto/create-produit.dto";
import { UpdateProduitDto } from "./dto/update-produit.dto";
import { FindProduitsQueryDto } from "./dto/find-produits.query.dto";

@Injectable()
export class ProduitsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  findAll(query: FindProduitsQueryDto, hotelId: string) {
    return this.prisma.produit.findMany({
      where: { hotelId, categorie: query.categorie, actif: query.actif },
      orderBy: [{ categorie: "asc" }, { nom: "asc" }],
    });
  }

  async findOne(id: string, hotelId: string) {
    const produit = await this.prisma.produit.findUnique({ where: { id, hotelId } });
    if (!produit) {
      throw new NotFoundException(`Aucun produit trouvé avec l'identifiant ${id}.`);
    }
    return produit;
  }

  create(dto: CreateProduitDto, hotelId: string) {
    return this.prisma.produit.create({ data: { ...dto, hotelId, stockActuel: dto.stockActuel ?? 0 } });
  }

  async update(id: string, dto: UpdateProduitDto, hotelId: string) {
    await this.findOne(id, hotelId);
    // syncVersion incrémenté manuellement (voir ChambresService.update pour le
    // détail complet) — indispensable pour la détection de conflit hors ligne.
    return this.prisma.produit.update({
      where: { id, hotelId },
      data: { ...dto, syncVersion: { increment: 1 } },
    });
  }

  async remove(id: string, hotelId: string) {
    await this.findOne(id, hotelId);
    try {
      await this.prisma.produit.delete({ where: { id, hotelId } });
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
