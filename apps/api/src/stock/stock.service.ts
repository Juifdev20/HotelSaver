import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@hotel-chicago/database";
import { PRISMA } from "../prisma/prisma.module";
import { CreateMouvementDto } from "./dto/create-mouvement.dto";
import { FindMouvementsQueryDto } from "./dto/find-mouvements.query.dto";
import { TypeMouvement } from "./types-mouvement";

type ClientOuTransaction = PrismaClient | Prisma.TransactionClient;

export interface ParamsMouvement {
  produitId: string;
  type: TypeMouvement;
  quantite: number;
  motif?: string;
  createdBy: string;
}

@Injectable()
export class StockService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  findAll(query: FindMouvementsQueryDto) {
    return this.prisma.mouvementStock.findMany({
      where: { produitId: query.produitId },
      include: { produit: true },
      orderBy: { createdAt: "desc" },
    });
  }

  create(dto: CreateMouvementDto, createdBy: string) {
    return this.prisma.$transaction((tx) =>
      this.enregistrerMouvement(tx, {
        produitId: dto.produitId,
        type: dto.type,
        quantite: dto.quantite,
        motif: dto.motif,
        createdBy,
      })
    );
  }

  /**
   * Cœur partagé de toute variation de stock : utilisé directement par
   * `create()` ci-dessus, et par CafeteriaService (dans sa propre transaction,
   * via le paramètre `client`) quand une ligne de commande consomme du stock.
   */
  async enregistrerMouvement(client: ClientOuTransaction, params: ParamsMouvement) {
    const produit = await client.produit.findUnique({ where: { id: params.produitId } });
    if (!produit) {
      throw new NotFoundException(`Aucun produit trouvé avec l'identifiant ${params.produitId}.`);
    }

    let delta: number;
    switch (params.type) {
      case "ENTREE":
        if (params.quantite <= 0) {
          throw new BadRequestException("La quantité doit être positive pour une entrée de stock.");
        }
        delta = params.quantite;
        break;
      case "SORTIE_VENTE":
      case "PERTE":
        if (params.quantite <= 0) {
          throw new BadRequestException(
            `La quantité doit être positive pour un mouvement ${params.type} (le sens est déjà porté par le type).`
          );
        }
        delta = -params.quantite;
        break;
      case "AJUSTEMENT":
        delta = params.quantite;
        break;
    }

    const nouveauStock = Number(produit.stockActuel) + delta;
    if (nouveauStock < 0) {
      throw new ConflictException(
        `Stock insuffisant pour "${produit.nom}" : ${produit.stockActuel} en stock, ` +
          `${Math.abs(delta)} demandé(s).`
      );
    }

    const mouvement = await client.mouvementStock.create({
      data: {
        produitId: params.produitId,
        quantite: params.quantite,
        type: params.type,
        motif: params.motif,
        createdBy: params.createdBy,
      },
    });

    // syncVersion incrémenté manuellement (voir ChambresService.update) : un
    // mouvement de stock modifie Produit.stockActuel, donc Produit change bien,
    // même si ce n'est pas ProduitsService.update qui l'a fait.
    await client.produit.update({
      where: { id: params.produitId },
      data: { stockActuel: nouveauStock, syncVersion: { increment: 1 } },
    });

    return mouvement;
  }
}
