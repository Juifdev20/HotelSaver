import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient, Produit } from "@hotel-chicago/database";
import { Role } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { messages } from "../notifications/messages";
import { CreateMouvementDto } from "./dto/create-mouvement.dto";
import { FindMouvementsQueryDto } from "./dto/find-mouvements.query.dto";
import { TypeMouvement } from "./types-mouvement";

type ClientOuTransaction = PrismaClient | Prisma.TransactionClient;

export interface ParamsMouvement {
  hotelId: string;
  produitId: string;
  type: TypeMouvement;
  quantite: number;
  motif?: string;
  createdBy: string;
}

@Injectable()
export class StockService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notifications: NotificationsService
  ) {}

  findAll(query: FindMouvementsQueryDto, hotelId: string) {
    return this.prisma.mouvementStock.findMany({
      where: { hotelId, produitId: query.produitId },
      include: { produit: true },
      orderBy: { createdAt: "desc" },
    });
  }

  create(dto: CreateMouvementDto, createdBy: string, hotelId: string) {
    return this.enregistrerMouvement(this.prisma, {
      hotelId,
      produitId: dto.produitId,
      type: dto.type,
      quantite: dto.quantite,
      motif: dto.motif,
      createdBy,
    });
  }

  /**
   * Ne fait que vérifier et appliquer la variation de stock, sans créer la
   * ligne `MouvementStock` — extrait de `enregistrerMouvement` pour que
   * CafeteriaService puisse créer ce mouvement et la ligne de commande EN
   * PARALLÈLE une fois le stock validé, au lieu de 3 aller-retours séquentiels
   * vers une base à l'autre bout d'une connexion lente (service cafétaria
   * jugé trop lent en conditions réelles, 26/09/2026 — chaque aller-retour
   * réseau compte). `produitDejaCharge` évite une deuxième lecture quand
   * l'appelant a déjà le produit en main (cas de CafeteriaService.ajouterLigne,
   * qui le lit pour vérifier `actif` avant d'appeler ceci).
   *
   * N'utilise plus `$transaction(async tx => ...)` pour l'écriture (retiré le
   * 26/09/2026) : le pooler Supabase est coincé en mode "transaction" depuis
   * la panne du mode "session" du 25/09/2026 (voir DECISIONS.md), incompatible
   * avec les transactions interactives Prisma ("Transaction not found"
   * systématique). À la place, `updateMany` conditionné sur la valeur déjà lue
   * (`stockActuel` dans le WHERE) : si un mouvement concurrent a changé le
   * stock entre-temps, `count` vaut 0 et on relance une erreur métier plutôt
   * que d'écraser une valeur périmée — remplace l'isolation de la transaction
   * par une vérification optimiste.
   */
  async decrementerStock(
    client: ClientOuTransaction,
    params: Pick<ParamsMouvement, "hotelId" | "produitId" | "type" | "quantite">,
    produitDejaCharge?: Pick<Produit, "nom" | "stockActuel"> & Partial<Pick<Produit, "seuilAlerte">>
  ): Promise<void> {
    const produit =
      produitDejaCharge ?? (await client.produit.findUnique({ where: { id: params.produitId, hotelId: params.hotelId } }));
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

    const { count } = await client.produit.updateMany({
      where: { id: params.produitId, hotelId: params.hotelId, stockActuel: produit.stockActuel },
      data: { stockActuel: nouveauStock, syncVersion: { increment: 1 } },
    });
    if (count === 0) {
      throw new ConflictException(`Le stock de "${produit.nom}" a changé entre-temps, réessayez.`);
    }

    this.alerterSiSeuilFranchi(params, produit, nouveauStock, delta);
  }

  /**
   * Point UNIQUE par où passe toute variation de stock (ventes cafétaria, synchronisation, écran Stock) :
   * l'alerte part donc quel que soit le chemin. On alerte au FRANCHISSEMENT du seuil (de « au-dessus » à
   * « au seuil ou en dessous », puis à zéro), pas à chaque vente : pas de spam, et réarmée dès qu'un
   * réapprovisionnement remonte le stock au-dessus du seuil.
   */
  private alerterSiSeuilFranchi(
    params: Pick<ParamsMouvement, "hotelId" | "produitId">,
    produit: Pick<Produit, "nom" | "stockActuel"> & Partial<Pick<Produit, "seuilAlerte">>,
    nouveauStock: number,
    delta: number
  ): void {
    if (delta >= 0) return;
    const avant = Number(produit.stockActuel);
    const roles = [Role.CAFETARIA, Role.PATRON];

    if (nouveauStock === 0 && avant > 0) {
      void this.notifications.emettre({ hotelId: params.hotelId, roles, ...messages.stockEpuise({ produit: produit.nom, produitId: params.produitId }) });
      return;
    }
    const seuil = produit.seuilAlerte === undefined ? null : Number(produit.seuilAlerte);
    if (seuil !== null && nouveauStock > 0 && nouveauStock <= seuil && avant > seuil) {
      void this.notifications.emettre({
        hotelId: params.hotelId,
        roles,
        ...messages.stockBas({ produit: produit.nom, stock: nouveauStock, produitId: params.produitId }),
      });
    }
  }

  /**
   * Cœur partagé de toute variation de stock : décrémente/incrémente puis
   * enregistre la ligne `MouvementStock`. Utilisé par `create()` ci-dessus
   * (écran Stock, pas un chemin à haute fréquence) ; CafeteriaService
   * n'appelle plus cette méthode directement (voir `decrementerStock`
   * ci-dessus) pour pouvoir paralléliser sa propre écriture.
   */
  async enregistrerMouvement(client: ClientOuTransaction, params: ParamsMouvement, produitDejaCharge?: Pick<Produit, "nom" | "stockActuel">) {
    await this.decrementerStock(client, params, produitDejaCharge);

    return client.mouvementStock.create({
      data: {
        hotelId: params.hotelId,
        produitId: params.produitId,
        quantite: params.quantite,
        type: params.type,
        motif: params.motif,
        createdBy: params.createdBy,
      },
    });
  }
}
