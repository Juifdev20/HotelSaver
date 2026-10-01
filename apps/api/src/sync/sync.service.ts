import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { PrismaClient } from "@hotel-chicago/database";
import { Role, UtilisateurAuthentifie, peutOperer } from "@hotel-chicago/types";
import { MESSAGE_PATRON_NON_OPERANT } from "../common/guards/roles.guard";
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
  /** Enfants créés implicitement par le CREATE parent (ex. le premier
   * sous-compte d'un CompteCafeteria, le client inline d'une Reservation),
   * renvoyés pour que le miroir local remplisse leur `remoteId` sans
   * attendre le prochain pull. EntitePull (pas EntitePush) : un enfant
   * peut être une entité non poussable directement (Client, Phase 16). */
  enfants?: { entiteType: EntitePull; localId: string; remoteId: string; syncVersion?: number }[];
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
  enfants?: { entiteType: EntitePull; localId: string; remoteId: string; syncVersion?: number }[];
}

/** Lecture (GET /sync/pull) — mêmes permissions que les endpoints GET directs de chaque module. */
const ROLES_LECTURE: Record<EntitePull, Role[]> = {
  Chambre: [Role.RECEPTIONNISTE, Role.PATRON],
  Reservation: [Role.RECEPTIONNISTE, Role.PATRON],
  Client: [Role.RECEPTIONNISTE, Role.PATRON],
  Facture: [Role.RECEPTIONNISTE, Role.PATRON],
  Produit: [Role.CAFETARIA, Role.PATRON],
  MouvementStock: [Role.CAFETARIA, Role.PATRON],
  CompteCafeteria: [Role.CAFETARIA, Role.PATRON],
  SousCompte: [Role.CAFETARIA, Role.PATRON],
  LigneCommande: [Role.CAFETARIA, Role.PATRON],
  VenteCafeteria: [Role.CAFETARIA, Role.PATRON],
};

/** Opérations du quotidien (séparation des tâches) : la synchronisation applique la même règle que les routes
 * HTTP marquées @Operationnel — sinon le patron les contournerait en passant par l'écriture hors ligne. */
const ENTITES_OPERATIONNELLES: ReadonlySet<EntitePush> = new Set<EntitePush>(["Reservation", "CompteCafeteria", "SousCompte", "LigneCommande"]);

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
        create: (payload, currentUser) => this.chambresService.create(payload as any, currentUser.hotelId),
        update: (id, payload, currentUser) => this.chambresService.update(id, payload as any, currentUser),
      },
      Reservation: {
        rolesCreate: [Role.RECEPTIONNISTE, Role.PATRON],
        rolesUpdate: [Role.RECEPTIONNISTE, Role.PATRON],
        create: async (payload, currentUser) => {
          const cree = await this.reservationsService.create(payload as any, currentUser);
          // Un client inline (payload.client, nouveau client) est créé
          // implicitement côté serveur — même mécanisme que le premier
          // sous-compte cafétaria : si l'appareil a envoyé l'id local de sa
          // ligne Client optimiste, le mapping évite le doublon au pull.
          const clientLocalId = (payload as { clientLocalId?: string }).clientLocalId;
          if (!clientLocalId || !cree.client) return cree;
          return {
            ...cree,
            enfants: [
              { entiteType: "Client" as const, localId: clientLocalId, remoteId: cree.client.id, syncVersion: cree.client.syncVersion },
            ],
          };
        },
        update: (id, payload, currentUser) => this.reservationsService.update(id, payload as any, currentUser.hotelId),
      },
      Produit: {
        rolesCreate: [Role.PATRON],
        rolesUpdate: [Role.PATRON],
        create: (payload, currentUser) => this.produitsService.create(payload as any, currentUser.hotelId),
        update: (id, payload, currentUser) => this.produitsService.update(id, payload as any, currentUser.hotelId),
      },
      MouvementStock: {
        rolesCreate: [Role.CAFETARIA, Role.PATRON],
        rolesUpdate: [],
        create: (payload, currentUser) => this.stockService.create(payload as any, currentUser.userId, currentUser.hotelId),
      },
      CompteCafeteria: {
        rolesCreate: [Role.CAFETARIA, Role.PATRON],
        rolesUpdate: [],
        create: async (payload, currentUser) => {
          const cree = await this.cafeteriaService.ouvrirCompte(payload as any, currentUser);
          // ouvrirCompte crée aussi le premier sous-compte côté serveur : si
          // le client a envoyé l'id local de ce sous-compte, on renvoie le
          // mapping — sinon le miroir local garderait un enfant fantôme sans
          // remoteId, doublé au prochain pull (bug constaté le 27/09/2026).
          const premier = cree.sousComptes?.[0];
          const localIdPremier = (payload as { premierSousCompteLocalId?: string }).premierSousCompteLocalId;
          if (!premier || !localIdPremier) return cree;
          return {
            ...cree,
            enfants: [{ entiteType: "SousCompte" as const, localId: localIdPremier, remoteId: premier.id, syncVersion: premier.syncVersion }],
          };
        },
      },
      SousCompte: {
        rolesCreate: [Role.CAFETARIA, Role.PATRON],
        rolesUpdate: [],
        create: (payload, currentUser) => {
          const { compteId, ...dto } = payload as { compteId?: string; nom?: string };
          if (!compteId) {
            throw new BadRequestException("compteId est obligatoire dans le payload pour SousCompte.");
          }
          return this.cafeteriaService.ajouterSousCompte(compteId, dto as any, currentUser.hotelId);
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

    if (ENTITES_OPERATIONNELLES.has(operation.entiteType) && !peutOperer(currentUser)) {
      return this.erreur(operation, MESSAGE_PATRON_NON_OPERANT);
    }

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
          enfants: cree.enfants,
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
      const actuel = await (this.prisma as any)[accesseur].findUnique({
        where: { id: operation.remoteId, hotelId: currentUser.hotelId },
      });
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
        where: { hotelId: currentUser.hotelId, updatedAt: { gt: depuis } },
        orderBy: { updatedAt: "asc" },
      });
    }
    return resultat;
  }
}
