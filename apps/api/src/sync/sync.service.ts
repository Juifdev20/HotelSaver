import { BadRequestException, HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma, PrismaClient } from "@hotel-chicago/database";
import { Role, UtilisateurAuthentifie, peutOperer } from "@hotel-chicago/types";
import { MESSAGE_PATRON_NON_OPERANT } from "../common/guards/roles.guard";
import { PRISMA } from "../prisma/prisma.module";
import { ChambresService } from "../chambres/chambres.service";
import { ReservationsService } from "../reservations/reservations.service";
import { ProduitsService } from "../produits/produits.service";
import { StockService } from "../stock/stock.service";
import { CafeteriaService } from "../cafeteria/cafeteria.service";
import { DepensesService } from "../depenses/depenses.service";
import { departementDuRole } from "../common/departement";
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
  /** ERROR seulement : panne passagère (base injoignable, opération déjà en cours) — l'appareil doit RÉESSAYER sans
   * compter un échec. Absent/false = refus définitif (règle métier) : après quelques essais, décision humaine. */
  temporaire?: boolean;
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
  Depense: [Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON],
};

/** Filtre de lecture supplémentaire par entité, au-delà de l'hôtel : un
 * réceptionniste ne doit pas recevoir les dépenses de la cafétaria (et
 * inversement) ; le patron reçoit tout. */
const FILTRE_LECTURE: Partial<Record<EntitePull, (user: UtilisateurAuthentifie) => Record<string, unknown>>> = {
  Depense: (user) => {
    const departement = departementDuRole(user.role);
    return departement ? { departement } : {};
  },
};

/** Opérations du quotidien (séparation des tâches) : la synchronisation applique la même règle que les routes
 * HTTP marquées @Operationnel — sinon le patron les contournerait en passant par l'écriture hors ligne. */
const ENTITES_OPERATIONNELLES: ReadonlySet<EntitePush> = new Set<EntitePush>(["Reservation", "CompteCafeteria", "SousCompte", "LigneCommande"]);

/** Une réservation « EN_COURS » plus ancienne que ça vient d'un traitement interrompu (serveur arrêté en plein travail). */
const DELAI_RESERVATION_PERIMEE_MS = 2 * 60_000;
/** Marge de relecture : un pull repart un peu AVANT le moment du serveur, au cas où une transaction longue n'aurait validé
 * une ligne qu'après le passage du pull précédent. Les écritures locales sont des « upsert » : relire est sans danger. */
const RECOUVREMENT_PULL_MS = 5_000;
const LIMITE_PULL_DEFAUT = 1000;
/** Écritures qui s'additionnent : leur date doit être celle de l'appareil, pas celle de l'envoi (hors ligne : des heures plus tard). */
const ENTITES_HORODATEES: ReadonlySet<EntitePush> = new Set<EntitePush>(["MouvementStock", "LigneCommande"]);
const FENETRE_HORODATAGE_MS = 30 * 24 * 3_600_000;
/** Codes Prisma d'une panne passagère (connexion perdue, délai dépassé, conflit d'écriture à rejouer). */
const CODES_PRISMA_PASSAGERS = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2034"]);

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly config: Record<EntitePush, ConfigEntite>;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly chambresService: ChambresService,
    private readonly reservationsService: ReservationsService,
    private readonly produitsService: ProduitsService,
    private readonly stockService: StockService,
    private readonly cafeteriaService: CafeteriaService,
    private readonly depensesService: DepensesService
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
      // Jamais le patron : il consulte les dépenses, il ne les saisit pas.
      Depense: {
        rolesCreate: [Role.RECEPTIONNISTE, Role.CAFETARIA],
        rolesUpdate: [Role.RECEPTIONNISTE, Role.CAFETARIA],
        create: (payload, currentUser) => this.depensesService.creer(payload as any, currentUser),
        update: (id, payload, currentUser) => this.depensesService.modifier(id, payload as any, currentUser),
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
    // `serveurLe` : l'heure du serveur, pour que l'appareil mesure le décalage de son horloge.
    return { resultats, serveurLe: new Date().toISOString() };
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
        return await this.creerUneSeuleFois(operation, currentUser, config);
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
        // Un envoi rejoué (réponse perdue) retombe ici : la première fois a déjà appliqué ces valeurs et fait avancer
        // la version. Si le serveur contient DÉJÀ exactement ce que l'appareil veut écrire, ce n'est pas un conflit.
        if (valeursDejaAppliquees(actuel, operation.payload)) {
          return { localId: operation.localId, remoteId: operation.remoteId, syncVersion: actuel.syncVersion, statut: "SYNCED" };
        }
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
      return this.erreurDepuisException(operation, error);
    }
  }

  /**
   * CREATE rejouable sans doublon. L'appareil réenvoie une opération dont il n'a pas reçu la réponse (coupure au mauvais
   * moment) : sans protection, une ligne de commande serait facturée deux fois, un mouvement de stock compté deux fois.
   * On RÉSERVE d'abord la clé (hôtel, type, identifiant local) ; si elle existe déjà et que la création est terminée,
   * on renvoie le résultat d'origine au lieu de recréer.
   */
  private async creerUneSeuleFois(operation: PushOperationDto, currentUser: UtilisateurAuthentifie, config: ConfigEntite): Promise<ResultatOperation> {
    const db = this.prisma as any;
    const cle = { hotelId: currentUser.hotelId, entiteType: operation.entiteType, localId: operation.localId };

    let reservation: { id: string };
    try {
      reservation = await db.syncCorrespondance.create({ data: { ...cle, statut: "EN_COURS" }, select: { id: true } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const existante = await db.syncCorrespondance.findUnique({ where: { hotelId_entiteType_localId: cle } });
      if (existante?.statut === "SYNCED" && existante.remoteId) {
        return {
          localId: operation.localId,
          remoteId: existante.remoteId,
          syncVersion: existante.syncVersion ?? undefined,
          statut: "SYNCED",
          enfants: (existante.enfants as ResultatOperation["enfants"]) ?? undefined,
        };
      }
      if (existante && Date.now() - new Date(existante.updatedAt).getTime() < DELAI_RESERVATION_PERIMEE_MS) {
        return { ...this.erreur(operation, "Cette opération est déjà en cours de traitement : nouvel essai dans un instant."), temporaire: true };
      }
      // Traitement interrompu (serveur arrêté entre la création et son enregistrement) : on ne SAIT pas si l'élément existe.
      // Refus définitif plutôt que risquer un doublon d'argent ; la personne vérifie puis retire l'action.
      return this.erreur(
        operation,
        "Le résultat de cette opération est incertain (le serveur a été interrompu en la traitant). Vérifiez si elle apparaît déjà, puis retirez cette action."
      );
    }

    let cree: EntiteCree;
    try {
      cree = await config.create(operation.payload, currentUser);
    } catch (error) {
      // Rien (ou rien de sûr) n'a été créé : on libère la clé pour qu'un nouvel essai puisse repartir.
      await db.syncCorrespondance.deleteMany({ where: { id: reservation.id } }).catch(() => undefined);
      throw error;
    }

    try {
      await db.syncCorrespondance.update({
        where: { id: reservation.id },
        data: { statut: "SYNCED", remoteId: cree.id, syncVersion: cree.syncVersion, enfants: (cree.enfants as Prisma.InputJsonValue) ?? Prisma.JsonNull },
      });
    } catch (error) {
      this.logger.error(`Création ${operation.entiteType} ${cree.id} réussie mais non enregistrée pour la reprise : ${(error as Error).message}`);
    }

    if (ENTITES_HORODATEES.has(operation.entiteType)) await this.appliquerHorodatageClient(operation, cree.id, currentUser.hotelId);

    return { localId: operation.localId, remoteId: cree.id, syncVersion: cree.syncVersion, statut: "SYNCED", enfants: cree.enfants };
  }

  /** Date une écriture à l'heure de l'appareil, bornée : jamais dans le futur, jamais plus de 30 jours en arrière. */
  private async appliquerHorodatageClient(operation: PushOperationDto, id: string, hotelId: string): Promise<void> {
    if (!operation.horodatageClient) return;
    const voulu = new Date(operation.horodatageClient).getTime();
    if (Number.isNaN(voulu)) return;
    const maintenant = Date.now();
    const borne = Math.min(Math.max(voulu, maintenant - FENETRE_HORODATAGE_MS), maintenant);
    try {
      await (this.prisma as any)[ACCESSEUR_PRISMA[operation.entiteType]].update({ where: { id, hotelId }, data: { createdAt: new Date(borne) } });
    } catch (error) {
      this.logger.warn(`Horodatage client non appliqué pour ${operation.entiteType} ${id} : ${(error as Error).message}`);
    }
  }

  private erreur(operation: PushOperationDto, message: string): ResultatOperation {
    return { localId: operation.localId, remoteId: operation.remoteId, statut: "ERROR", message };
  }

  /** Règle métier refusée (HttpException) = définitif ; panne de connexion ou de base = passager. */
  private erreurDepuisException(operation: PushOperationDto, error: unknown): ResultatOperation {
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    if (error instanceof HttpException) return this.erreur(operation, message);
    const passager =
      error instanceof Prisma.PrismaClientInitializationError ||
      error instanceof Prisma.PrismaClientUnknownRequestError ||
      (error instanceof Prisma.PrismaClientKnownRequestError && CODES_PRISMA_PASSAGERS.has(error.code));
    if (passager) this.logger.warn(`Panne passagère pendant la synchronisation (${operation.entiteType}) : ${message}`);
    return { ...this.erreur(operation, passager ? "Le serveur est momentanément indisponible : nouvel essai automatique." : message), temporaire: passager || undefined };
  }

  async pull(query: SyncPullQueryDto, currentUser: UtilisateurAuthentifie) {
    // Le moment du serveur est pris AVANT de lire : c'est lui (moins une marge), pas l'horloge de l'appareil, qui sert de
    // point de départ au prochain pull. Une horloge d'appareil en avance ferait manquer des changements.
    const debut = Date.now();
    const depuis = new Date(query.depuis);
    const limite = query.limite ?? LIMITE_PULL_DEFAUT;
    const entitesDemandees = query.entites
      ? (query.entites.split(",").map((e) => e.trim()) as EntitePull[])
      : [...ENTITES_PULL];

    const entitesAutorisees = entitesDemandees.filter((entite) =>
      (ROLES_LECTURE[entite] ?? []).includes(currentUser.role)
    );

    // En parallèle (08/10/2026) : chaque lecture coûte ~300 ms depuis Kasindi ;
    // en série, 11 entités faisaient ~3 s par synchronisation et retardaient
    // la caisse. Le pool `pg` (max 5) borne le nombre de requêtes simultanées.
    // `gte` + `take` : relire la dernière ligne d'une page est sans danger (upsert), alors que `gt` ferait sauter des
    // lignes partageant la même milliseconde à la frontière de deux pages.
    const lignes = await Promise.all(
      entitesAutorisees.map((entite) =>
        (this.prisma as any)[ACCESSEUR_PRISMA[entite]].findMany({
          where: { hotelId: currentUser.hotelId, updatedAt: { gte: depuis }, ...FILTRE_LECTURE[entite]?.(currentUser) },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          take: limite,
        }) as Promise<unknown[]>
      )
    );
    const resultat: Record<string, unknown> = {};
    const tronque: string[] = [];
    entitesAutorisees.forEach((entite, i) => {
      resultat[entite] = lignes[i];
      if (lignes[i].length >= limite) tronque.push(entite);
    });

    const suppressions = entitesAutorisees.length
      ? await this.prisma.suppression.findMany({
          where: { hotelId: currentUser.hotelId, entiteType: { in: entitesAutorisees }, createdAt: { gte: depuis } },
          orderBy: { createdAt: "asc" },
          take: 5000,
          select: { entiteType: true, entiteId: true, createdAt: true },
        })
      : [];

    return {
      ...resultat,
      _meta: {
        serveurLe: new Date().toISOString(),
        /** Où reprendre au prochain pull si rien n'est tronqué. */
        curseur: new Date(debut - RECOUVREMENT_PULL_MS).toISOString(),
        /** Types dont il reste des lignes à tirer (page pleine) : tirer encore avec le curseur propre à chaque type. */
        tronque,
        suppressions: suppressions.map((s: { entiteType: string; entiteId: string; createdAt: Date }) => ({ entiteType: s.entiteType, id: s.entiteId, supprimeLe: s.createdAt.toISOString() })),
      },
    };
  }
}

/** Vrai si `actuel` contient déjà toutes les valeurs que `payload` voudrait écrire (au moins une). */
export function valeursDejaAppliquees(actuel: Record<string, unknown>, payload: Record<string, unknown>): boolean {
  const cles = Object.keys(payload);
  if (cles.length === 0) return false;
  return cles.every((cle) => cle in actuel && memeValeur(actuel[cle], payload[cle]));
}

function memeValeur(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  if (a instanceof Date) return new Date(b as string).getTime() === a.getTime();
  // Decimal de Prisma (objet avec toNumber) contre nombre ou chaîne.
  if (typeof a === "object" && typeof (a as { toNumber?: unknown }).toNumber === "function") return Number(a) === Number(b);
  if (Array.isArray(a) || typeof a === "object") return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}
