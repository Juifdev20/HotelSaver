import { BadRequestException, HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
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
import { FacturesService } from "../factures/factures.service";
import { ClientsService } from "../clients/clients.service";
import { ModifierClientDto } from "../clients/dto/modifier-client.dto";
import { CreateReservationDto } from "../reservations/dto/create-reservation.dto";
import { UpdateReservationDto } from "../reservations/dto/update-reservation.dto";
import { CreateChambreDto } from "../chambres/dto/create-chambre.dto";
import { UpdateChambreDto } from "../chambres/dto/update-chambre.dto";
import { CreateProduitDto } from "../produits/dto/create-produit.dto";
import { UpdateProduitDto } from "../produits/dto/update-produit.dto";
import { CreateMouvementDto } from "../stock/dto/create-mouvement.dto";
import { OuvrirCompteDto } from "../cafeteria/dto/ouvrir-compte.dto";
import { AjouterSousCompteDto } from "../cafeteria/dto/ajouter-sous-compte.dto";
import { AjouterLigneDto } from "../cafeteria/dto/ajouter-ligne.dto";
import { CreerDepenseDto } from "../depenses/dto/creer-depense.dto";
import { ModifierDepenseDto } from "../depenses/dto/modifier-depense.dto";
import { CreateFactureDto } from "../factures/dto/create-facture.dto";
import { EncaisserCompteDto } from "../cafeteria/dto/encaisser-compte.dto";
import { MajStatutLigneDto } from "../cafeteria/dto/maj-statut-ligne.dto";
import { ConflitTransitoireException } from "../common/conflit-transitoire.exception";
import { departementDuRole } from "../common/departement";
import { ACCESSEUR_PRISMA, ACTIONS_RESERVATION, ENTITES_PULL, EntitePull, EntitePush, TypeOperationPush } from "./entites-synchronisables";
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
const ENTITES_OPERATIONNELLES: ReadonlySet<TypeOperationPush> = new Set<TypeOperationPush>([
  "Reservation", "CompteCafeteria", "SousCompte", "LigneCommande", "Facture", "VenteCafeteria", "ActionReservation",
]);

/** Champs du payload qui désignent une autre ligne. Hors ligne, l'appareil ne connaît parfois que l'identifiant LOCAL d'une
 * ligne créée plus tôt dans la même file (réservation puis check-in puis facture…) : le serveur le remplace par le vrai. */
const CLES_REFERENCE = ["chambreId", "clientId", "reservationId", "reservationLieeId", "compteId", "sousCompteId", "produitId", "ligneId"] as const;

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
  private readonly config: Record<TypeOperationPush, ConfigEntite>;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly chambresService: ChambresService,
    private readonly reservationsService: ReservationsService,
    private readonly produitsService: ProduitsService,
    private readonly stockService: StockService,
    private readonly cafeteriaService: CafeteriaService,
    private readonly depensesService: DepensesService,
    private readonly facturesService: FacturesService,
    private readonly clientsService: ClientsService
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
        // Tout payload de /sync/push est validé comme le corps HTTP équivalent (liste blanche des champs : un appareil ne peut jamais
        // écrire hotelId, id ou syncVersion, ni envoyer un type inattendu).
        create: async (payload, currentUser) => this.chambresService.create(await this.valider(CreateChambreDto, payload), currentUser.hotelId),
        update: async (id, payload, currentUser) => this.chambresService.update(id, await this.valider(UpdateChambreDto, payload), currentUser),
      },
      Reservation: {
        rolesCreate: [Role.RECEPTIONNISTE, Role.PATRON],
        rolesUpdate: [Role.RECEPTIONNISTE, Role.PATRON],
        create: async (payload, currentUser) => {
          // Même validation que POST /reservations (dates, identifiants) : le payload de /sync/push ne passe pas par le ValidationPipe.
          const cree = await this.reservationsService.create(await this.valider(CreateReservationDto, payload), currentUser);
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
        update: async (id, payload, currentUser) =>
          this.reservationsService.update(id, await this.valider(UpdateReservationDto, payload), currentUser.hotelId),
      },
      Produit: {
        rolesCreate: [Role.PATRON],
        rolesUpdate: [Role.PATRON],
        create: async (payload, currentUser) => this.produitsService.create(await this.valider(CreateProduitDto, payload), currentUser.hotelId),
        update: async (id, payload, currentUser) =>
          this.produitsService.update(id, await this.valider(UpdateProduitDto, payload), currentUser.hotelId),
      },
      MouvementStock: {
        rolesCreate: [Role.CAFETARIA, Role.PATRON],
        rolesUpdate: [],
        create: async (payload, currentUser) =>
          this.stockService.create(await this.valider(CreateMouvementDto, payload), currentUser.userId, currentUser.hotelId),
      },
      CompteCafeteria: {
        rolesCreate: [Role.CAFETARIA, Role.PATRON],
        rolesUpdate: [],
        create: async (payload, currentUser) => {
          const cree = await this.cafeteriaService.ouvrirCompte(await this.valider(OuvrirCompteDto, payload), currentUser);
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
        create: async (payload, currentUser) => {
          const { compteId, ...reste } = payload as { compteId?: string };
          if (!compteId) {
            throw new BadRequestException("compteId est obligatoire dans le payload pour SousCompte.");
          }
          return this.cafeteriaService.ajouterSousCompte(compteId, await this.valider(AjouterSousCompteDto, reste), currentUser.hotelId);
        },
      },
      LigneCommande: {
        rolesCreate: [Role.CAFETARIA, Role.PATRON],
        rolesUpdate: [],
        create: async (payload, currentUser) => {
          const { compteId, ...reste } = payload as { compteId?: string };
          if (!compteId) {
            throw new BadRequestException("compteId est obligatoire dans le payload pour LigneCommande.");
          }
          const dto = await this.valider(AjouterLigneDto, reste);
          // Une vente faite hors ligne a déjà eu lieu : le stock du serveur peut devenir négatif plutôt que de refuser la ligne.
          return this.cafeteriaService.ajouterLigne(compteId, dto, currentUser, { horsLigne: true });
        },
      },
      // Jamais le patron : il consulte les dépenses, il ne les saisit pas.
      Depense: {
        rolesCreate: [Role.RECEPTIONNISTE, Role.CAFETARIA],
        rolesUpdate: [Role.RECEPTIONNISTE, Role.CAFETARIA],
        create: async (payload, currentUser) => this.depensesService.creer(await this.valider(CreerDepenseDto, payload), currentUser),
        update: async (id, payload, currentUser) => this.depensesService.modifier(id, await this.valider(ModifierDepenseDto, payload), currentUser),
      },
      Client: {
        rolesCreate: [],
        rolesUpdate: [Role.RECEPTIONNISTE, Role.PATRON],
        create: () => {
          throw new BadRequestException("Un client se crée avec sa réservation.");
        },
        update: async (id, payload, currentUser) => {
          const dto = await this.valider(ModifierClientDto, payload);
          const client = await this.clientsService.update(id, dto, currentUser.hotelId);
          return { id: client.id, syncVersion: client.syncVersion };
        },
      },
      // Encaissements : l'appareil n'envoie que l'intention ; totaux, taux de change et numéro de reçu définitif sont recalculés ici.
      Facture: {
        rolesCreate: [Role.RECEPTIONNISTE, Role.PATRON],
        rolesUpdate: [],
        create: async (payload, currentUser) => {
          const dto = await this.valider(CreateFactureDto, payload);
          const facture = await this.facturesService.create(dto, currentUser.hotelId, { numeroProvisoire: texteCourt(payload.numeroProvisoire) });
          return { id: facture.id, syncVersion: facture.syncVersion };
        },
      },
      VenteCafeteria: {
        rolesCreate: [Role.CAFETARIA, Role.PATRON],
        rolesUpdate: [],
        create: async (payload, currentUser) => {
          const compteId = texteCourt(payload.compteId);
          if (!compteId) throw new BadRequestException("compteId est obligatoire pour encaisser un compte.");
          const dto = await this.valider(EncaisserCompteDto, payload);
          const ventesLocalIds = listeTextes(payload.ventesLocalIds);
          const ventes = await this.cafeteriaService.encaisser(compteId, dto, currentUser, { numerosProvisoires: listeTextes(payload.numerosProvisoires) });
          const [premiere, ...autres] = ventes;
          // Plusieurs reçus (un par personne, ou partage égal) : le premier porte l'opération, les autres reviennent en « enfants ».
          const enfants = autres.flatMap((v, i) =>
            ventesLocalIds[i + 1] ? [{ entiteType: "VenteCafeteria" as const, localId: ventesLocalIds[i + 1], remoteId: v.id, syncVersion: v.syncVersion }] : []
          );
          return { id: premiere.id, syncVersion: premiere.syncVersion, enfants };
        },
      },
      // Ordres (check-in, annulation…) : voir COMMANDES_PUSH.
      ActionReservation: {
        rolesCreate: [Role.RECEPTIONNISTE, Role.PATRON],
        rolesUpdate: [],
        create: async (payload, currentUser) => {
          const reservationId = texteCourt(payload.reservationId);
          const action = payload.action;
          if (!reservationId) throw new BadRequestException("reservationId est obligatoire.");
          if (typeof action !== "string" || !(ACTIONS_RESERVATION as readonly string[]).includes(action)) {
            throw new BadRequestException(`action doit être l'une de : ${ACTIONS_RESERVATION.join(", ")}.`);
          }
          const { hotelId } = currentUser;
          if (action === "CONFIRMER") await this.reservationsService.confirmer(reservationId, hotelId);
          else if (action === "CHECK_IN") await this.reservationsService.checkIn(reservationId, hotelId);
          else if (action === "CHECK_OUT") await this.reservationsService.checkOut(reservationId, hotelId);
          else {
            const motif = typeof payload.motif === "string" ? payload.motif.trim() : "";
            if (!motif) throw new BadRequestException("Le motif d'annulation est obligatoire.");
            await this.reservationsService.annuler(reservationId, { motif: motif.slice(0, 500) }, hotelId, currentUser);
          }
          const apres = await this.prisma.reservation.findUnique({ where: { id: reservationId, hotelId }, select: { syncVersion: true } });
          return { id: reservationId, syncVersion: apres?.syncVersion ?? 1 };
        },
      },
      ActionLigne: {
        rolesCreate: [Role.CAFETARIA, Role.PATRON],
        rolesUpdate: [],
        create: async (payload, currentUser) => {
          const ligneId = texteCourt(payload.ligneId);
          if (!ligneId) throw new BadRequestException("ligneId est obligatoire.");
          const dto = await this.valider(MajStatutLigneDto, payload);
          const ligne = await this.cafeteriaService.majStatutLigne(ligneId, dto, currentUser.hotelId);
          return { id: ligneId, syncVersion: ligne.syncVersion };
        },
      },
    };
  }

  async push(dto: SyncPushDto, currentUser: UtilisateurAuthentifie) {
    const resultats: ResultatOperation[] = [];
    // Actions du lot qui n'ont pas abouti : celles qui en dépendent (même identifiant local cité dans leur payload) ne
    // sont pas tentées — « plus tard » si la panne est passagère, « refusée » si le parent l'est.
    const echecs = new Map<string, "temporaire" | "definitif">();
    // Modifications successives d'une même ligne dans ce lot (deux changements de statut d'une chambre faits hors ligne) : la
    // seconde a été faite SUR la première ; sa version de départ est donc celle qu'a produite la première, pas un conflit.
    const chaines = new Map<string, { baseOrigine: number; versionApres: number }>();
    // Séquentiel, jamais Promise.all : les opérations d'un même lot peuvent se
    // référencer entre elles dans l'ordre (ex. ouvrir un compte puis y ajouter
    // une ligne juste après), donc l'ordre chronologique d'arrivée doit être
    // respecté (section 10.2).
    for (const operation of dto.operations) {
      const parent = [...referencesDe(operation)].map((r) => echecs.get(r)).find(Boolean);
      let resultat: ResultatOperation;
      if (parent === "temporaire") {
        resultat = { ...this.erreur(operation, "En attente de l'action précédente, qui n'a pas encore pu être traitée."), temporaire: true };
      } else if (parent === "definitif") {
        resultat = this.erreur(operation, "Cette action dépend d'une action précédente qui a été refusée.");
      } else {
        resultat = await this.traiterOperation(operation, currentUser, chaines);
      }
      if (resultat.statut === "ERROR") echecs.set(operation.localId, resultat.temporaire ? "temporaire" : "definitif");
      resultats.push(resultat);
    }
    // `serveurLe` : l'heure du serveur, pour que l'appareil mesure le décalage de son horloge.
    return { resultats, serveurLe: new Date().toISOString() };
  }

  private async traiterOperation(
    operation: PushOperationDto,
    currentUser: UtilisateurAuthentifie,
    chaines: Map<string, { baseOrigine: number; versionApres: number }> = new Map()
  ): Promise<ResultatOperation> {
    const config = this.config[operation.entiteType];

    // L'annulation d'une réservation reste ouverte au patron (comme la route HTTP, qui n'est pas @Operationnel).
    const operationnel = operation.entiteType === "ActionReservation" ? operation.payload?.action !== "ANNULER" : ENTITES_OPERATIONNELLES.has(operation.entiteType);
    if (operationnel && !peutOperer(currentUser)) {
      return this.erreur(operation, MESSAGE_PATRON_NON_OPERANT);
    }

    try {
      operation = await this.resoudreReferencesLocales(operation, currentUser.hotelId);
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

      const accesseur = ACCESSEUR_PRISMA[operation.entiteType as EntitePull];
      const actuel = await (this.prisma as any)[accesseur].findUnique({
        where: { id: operation.remoteId, hotelId: currentUser.hotelId },
      });
      // Une dépense d'un autre département reste invisible (même réponse qu'une ligne inconnue) : sinon un conflit provoqué
      // volontairement en renverrait le contenu complet.
      if (!actuel || (operation.entiteType === "Depense" && actuel.departement !== departementDuRole(currentUser.role))) {
        return this.erreur(operation, `Aucune ligne ${operation.entiteType} trouvée avec l'identifiant ${operation.remoteId}.`);
      }

      const chaine = chaines.get(operation.remoteId);
      const baseEffective = chaine && operation.baseSyncVersion === chaine.baseOrigine ? chaine.versionApres : operation.baseSyncVersion;
      if (actuel.syncVersion !== baseEffective) {
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
      chaines.set(operation.remoteId, { baseOrigine: chaine?.baseOrigine ?? operation.baseSyncVersion, versionApres: mis.syncVersion });
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

    // Les enfants créés en même temps (client inline, premier sous-compte, reçus supplémentaires) peuvent être cités par
    // la suite de la file : on retient aussi leur correspondance.
    if (cree.enfants?.length) {
      await db.syncCorrespondance
        .createMany({
          data: cree.enfants.map((e) => ({ hotelId: currentUser.hotelId, entiteType: e.entiteType, localId: e.localId, statut: "SYNCED", remoteId: e.remoteId, syncVersion: e.syncVersion ?? null })),
          skipDuplicates: true,
        })
        .catch((error: Error) => this.logger.warn(`Correspondance des enfants non enregistrée : ${error.message}`));
    }

    if (ENTITES_HORODATEES.has(operation.entiteType as EntitePush)) await this.appliquerHorodatageClient(operation, cree.id, currentUser.hotelId);

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
      await (this.prisma as any)[ACCESSEUR_PRISMA[operation.entiteType as EntitePull]].update({ where: { id, hotelId }, data: { createdAt: new Date(borne) } });
    } catch (error) {
      this.logger.warn(`Horodatage client non appliqué pour ${operation.entiteType} ${id} : ${(error as Error).message}`);
    }
  }

  /** Valide un payload avec les mêmes règles que la route HTTP équivalente (le payload de /sync/push n'est pas passé au
   * ValidationPipe) ; les champs inconnus (hotelId, id…) sont retirés. */
  private async valider<T extends object>(Classe: new () => T, payload: Record<string, unknown>): Promise<T> {
    const instance = plainToInstance(Classe, payload);
    const erreurs = await validate(instance, { whitelist: true });
    if (erreurs.length > 0) {
      throw new BadRequestException(erreurs.flatMap((e) => Object.values(e.constraints ?? {})).join(" "));
    }
    return instance;
  }

  /**
   * Remplace les identifiants LOCAUX cités par une opération (créés plus tôt dans la file de l'appareil) par les vrais
   * identifiants serveur, d'après les créations déjà enregistrées pour CET hôtel. Un identifiant inconnu est laissé tel quel :
   * la règle métier de l'action répondra « introuvable ».
   */
  private async resoudreReferencesLocales(operation: PushOperationDto, hotelId: string): Promise<PushOperationDto> {
    const refs = referencesDe(operation);
    if (refs.size === 0) return operation;
    const lignes = await this.prisma.syncCorrespondance.findMany({
      where: { hotelId, localId: { in: [...refs] }, statut: "SYNCED", remoteId: { not: null } },
      select: { localId: true, remoteId: true },
    });
    if (lignes.length === 0) return operation;
    const vers = new Map(lignes.map((l) => [l.localId, l.remoteId!]));
    const payload = { ...operation.payload };
    for (const cle of CLES_REFERENCE) {
      const v = payload[cle];
      if (typeof v === "string" && vers.has(v)) payload[cle] = vers.get(v);
    }
    return { ...operation, payload, remoteId: operation.remoteId ? vers.get(operation.remoteId) ?? operation.remoteId : operation.remoteId };
  }

  private erreur(operation: PushOperationDto, message: string): ResultatOperation {
    return { localId: operation.localId, remoteId: operation.remoteId, statut: "ERROR", message };
  }

  /** Règle métier refusée (HttpException) = définitif ; panne de connexion ou de base = passager. */
  private erreurDepuisException(operation: PushOperationDto, error: unknown): ResultatOperation {
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    if (error instanceof ConflitTransitoireException) return { ...this.erreur(operation, message), temporaire: true };
    if (error instanceof HttpException) return this.erreur(operation, message);
    const passager =
      error instanceof Prisma.PrismaClientInitializationError ||
      error instanceof Prisma.PrismaClientUnknownRequestError ||
      (error instanceof Prisma.PrismaClientKnownRequestError && CODES_PRISMA_PASSAGERS.has(error.code));
    if (passager) this.logger.warn(`Panne passagère pendant la synchronisation (${operation.entiteType}) : ${message}`);
    if (!passager) this.logger.warn(`Opération refusée (${operation.entiteType}) : ${message}`);
    // Jamais le message brut d'une exception interne (Prisma : nom du modèle, requête, valeurs) : il part au journal du serveur.
    return {
      ...this.erreur(operation, passager ? "Le serveur est momentanément indisponible : nouvel essai automatique." : "Cette opération n'a pas pu être enregistrée par le serveur."),
      temporaire: passager || undefined,
    };
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

/** Texte non vide, borné (identifiants, numéros de reçu) ; autre chose = undefined. */
function texteCourt(valeur: unknown, max = 80): string | undefined {
  return typeof valeur === "string" && valeur.trim() !== "" ? valeur.trim().slice(0, max) : undefined;
}

function listeTextes(valeur: unknown, maxElements = 50): string[] {
  return Array.isArray(valeur) ? valeur.slice(0, maxElements).flatMap((v) => (texteCourt(v) ? [texteCourt(v)!] : [])) : [];
}

/** Identifiants (locaux ou serveur) cités par une opération : son propre `remoteId` et les champs de CLES_REFERENCE. */
function referencesDe(operation: PushOperationDto): Set<string> {
  const refs = new Set<string>();
  if (operation.remoteId) refs.add(operation.remoteId);
  for (const cle of CLES_REFERENCE) {
    const v = operation.payload?.[cle];
    if (typeof v === "string") refs.add(v);
  }
  return refs;
}
