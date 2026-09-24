import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { PrismaClient } from "@hotel-chicago/database";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { ChambresService } from "../chambres/chambres.service";
import { ReservationsService } from "../reservations/reservations.service";
import { ProduitsService } from "../produits/produits.service";
import { StockService } from "../stock/stock.service";
import { CafeteriaService } from "../cafeteria/cafeteria.service";
import { ACCESSEUR_PRISMA, ENTITES_PULL, EntitePull, EntitePush } from "./entites-synchronisables";
import { SyncPushDto } from "./dto/sync-push.dto";
import { PushOperationDto } from "./dto/push-operation.dto";
import { SyncPullQueryDto } from "./dto/sync-pull.query.dto";

interface EntiteCree {
  id: string;
  syncVersion: number;
}

interface ConfigEntite {
  rolesCreate: Role[];
  rolesUpdate: Role[];
  create: (payload: Record<string, unknown>, currentUser: UtilisateurAuthentifie) => Promise<EntiteCree>;
  /** Absent = pas de mise à jour possible via sync pour ce type (ex: MouvementStock,
   * LigneCommande — journaux immuables ; CompteCafeteria — la fermeture passe
   * obligatoirement par /cafeteria/comptes/:id/encaisser, jamais un passthrough générique). */
  update?: (id: string, payload: Record<string, unknown>, currentUser: UtilisateurAuthentifie) => Promise<EntiteCree>;
}

interface ResultatOperation {
  localId: string;
  remoteId?: string;
  syncVersion?: number;
  statut: "SYNCED" | "CONFLICT" | "ERROR";
  message?: string;
  donneesServeur?: unknown;
}

/** Lecture (GET /sync/pull) — mêmes permissions que les endpoints GET directs de chaque module. */
const ROLES_LECTURE: Record<EntitePull, Role[]> = {
  Chambre: [Role.RECEPTIONNISTE, Role.PATRON],
  Reservation: [Role.RECEPTIONNISTE, Role.PATRON],
  Facture: [Role.RECEPTIONNISTE, Role.PATRON],
  Produit: [Role.CAFETARIA, Role.PATRON],
  MouvementStock: [Role.CAFETARIA, Role.PATRON],
  CompteCafeteria: [Role.CAFETARIA, Role.PATRON],
  SousCompte: [Role.CAFETARIA, Role.PATRON],
  LigneCommande: [Role.CAFETARIA, Role.PATRON],
  VenteCafeteria: [Role.CAFETARIA, Role.PATRON],
};

@Injectable()
export class SyncService {
  private readonly config: Record<EntitePush, ConfigEntite>;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly chambresService: ChambresService,
    private readonly reservationsService: ReservationsService,
    private readonly produitsService: ProduitsService,
    private readonly stockService: StockService,
    private readonly cafeteriaService: CafeteriaService
  ) {
    // Chaque entité délègue à son service métier existant plutôt qu'à un
    // passthrough Prisma générique : ça réutilise gratuitement toute la
    // validation et les effets de bord déjà en place (ex. LigneCommande décrémente
    // le stock via CafeteriaService.ajouterLigne — un simple `create()` générique
    // casserait cet invariant), et garantit que la sync ne peut jamais faire plus
    // que ce que l'endpoint direct équivalent permettrait déjà.
    this.config = {
      Chambre: {
        rolesCreate: [Role.PATRON],
        rolesUpdate: [Role.RECEPTIONNISTE, Role.PATRON],
        create: (payload) => this.chambresService.create(payload as any),
        update: (id, payload, currentUser) => this.chambresService.update(id, payload as any, currentUser),
      },
      Reservation: {
        rolesCreate: [Role.RECEPTIONNISTE, Role.PATRON],
        rolesUpdate: [Role.RECEPTIONNISTE, Role.PATRON],
        create: (payload, currentUser) => this.reservationsService.create(payload as any, currentUser),
        update: (id, payload) => this.reservationsService.update(id, payload as any),
      },
      Produit: {
        rolesCreate: [Role.PATRON],
        rolesUpdate: [Role.PATRON],
        create: (payload) => this.produitsService.create(payload as any),
        update: (id, payload) => this.produitsService.update(id, payload as any),
      },
      MouvementStock: {
        rolesCreate: [Role.CAFETARIA, Role.PATRON],
        rolesUpdate: [],
        create: (payload, currentUser) => this.stockService.create(payload as any, currentUser.userId),
      },
      CompteCafeteria: {
        rolesCreate: [Role.CAFETARIA, Role.PATRON],
        rolesUpdate: [],
        create: (payload, currentUser) => this.cafeteriaService.ouvrirCompte(payload as any, currentUser),
      },
      SousCompte: {
        rolesCreate: [Role.CAFETARIA, Role.PATRON],
        rolesUpdate: [],
        create: (payload) => {
          const { compteId, ...dto } = payload as { compteId?: string; nom?: string };
          if (!compteId) {
            throw new BadRequestException("compteId est obligatoire dans le payload pour SousCompte.");
          }
          return this.cafeteriaService.ajouterSousCompte(compteId, dto as any);
        },
      },
      LigneCommande: {
        rolesCreate: [Role.CAFETARIA, Role.PATRON],
        rolesUpdate: [],
        create: (payload, currentUser) => {
          const { compteId, ...dto } = payload as { compteId?: string };
          if (!compteId) {
            throw new BadRequestException("compteId est obligatoire dans le payload pour LigneCommande.");
          }
          return this.cafeteriaService.ajouterLigne(compteId, dto as any, currentUser);
        },
      },
    };
  }

  async push(dto: SyncPushDto, currentUser: UtilisateurAuthentifie) {
    const resultats: ResultatOperation[] = [];
    // Séquentiel, jamais Promise.all : les opérations d'un même lot peuvent se
    // référencer entre elles dans l'ordre (ex. ouvrir un compte puis y ajouter
    // une ligne juste après), donc l'ordre chronologique d'arrivée doit être
    // respecté (section 10.2).
    for (const operation of dto.operations) {
      resultats.push(await this.traiterOperation(operation, currentUser));
    }
    return { resultats };
  }

  private async traiterOperation(
    operation: PushOperationDto,
    currentUser: UtilisateurAuthentifie
  ): Promise<ResultatOperation> {
    const config = this.config[operation.entiteType];

    try {
      if (operation.operation === "CREATE") {
        if (!config.rolesCreate.includes(currentUser.role)) {
          return this.erreur(operation, `Le rôle ${currentUser.role} ne peut pas créer une entité ${operation.entiteType}.`);
        }
        const cree = await config.create(operation.payload, currentUser);
        return {
          localId: operation.localId,
          remoteId: cree.id,
          syncVersion: cree.syncVersion,
          statut: "SYNCED",
        };
      }

      // UPDATE
      if (!config.update || config.rolesUpdate.length === 0) {
        return this.erreur(operation, `${operation.entiteType} ne peut pas être modifié via synchronisation.`);
      }
      if (!config.rolesUpdate.includes(currentUser.role)) {
        return this.erreur(operation, `Le rôle ${currentUser.role} ne peut pas modifier une entité ${operation.entiteType}.`);
      }
      if (!operation.remoteId) {
        return this.erreur(operation, "remoteId est obligatoire pour une opération UPDATE.");
      }
      if (operation.baseSyncVersion === undefined) {
        return this.erreur(operation, "baseSyncVersion est obligatoire pour une opération UPDATE.");
      }

      const accesseur = ACCESSEUR_PRISMA[operation.entiteType];
      const actuel = await (this.prisma as any)[accesseur].findUnique({ where: { id: operation.remoteId } });
      if (!actuel) {
        return this.erreur(operation, `Aucune ligne ${operation.entiteType} trouvée avec l'identifiant ${operation.remoteId}.`);
      }

      if (actuel.syncVersion !== operation.baseSyncVersion) {
        // Le serveur gagne (section 10.4) : rien n'est appliqué, l'appareil doit
        // afficher un écran "Conflits à vérifier" avec les données serveur.
        return {
          localId: operation.localId,
          remoteId: operation.remoteId,
          syncVersion: actuel.syncVersion,
          statut: "CONFLICT",
          donneesServeur: actuel,
        };
      }

      const mis = await config.update(operation.remoteId, operation.payload, currentUser);
      return {
        localId: operation.localId,
        remoteId: operation.remoteId,
        syncVersion: mis.syncVersion,
        statut: "SYNCED",
      };
    } catch (error) {
      return this.erreur(operation, error instanceof Error ? error.message : "Erreur inconnue.");
    }
  }

  private erreur(operation: PushOperationDto, message: string): ResultatOperation {
    return { localId: operation.localId, remoteId: operation.remoteId, statut: "ERROR", message };
  }

  async pull(query: SyncPullQueryDto, currentUser: UtilisateurAuthentifie) {
    const depuis = new Date(query.depuis);
    const entitesDemandees = query.entites
      ? (query.entites.split(",").map((e) => e.trim()) as EntitePull[])
      : [...ENTITES_PULL];

    const entitesAutorisees = entitesDemandees.filter((entite) =>
      (ROLES_LECTURE[entite] ?? []).includes(currentUser.role)
    );

    const resultat: Record<string, unknown[]> = {};
    for (const entite of entitesAutorisees) {
      const accesseur = ACCESSEUR_PRISMA[entite];
      resultat[entite] = await (this.prisma as any)[accesseur].findMany({
        where: { updatedAt: { gt: depuis } },
        orderBy: { updatedAt: "asc" },
      });
    }
    return resultat;
  }
}
