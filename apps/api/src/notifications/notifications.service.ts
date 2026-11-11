import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma, PrismaClient, Role as RolePrisma } from "@hotel-chicago/database";
import type { EtatPushNotifications, ListeNotifications, LienNotification, NotificationApp, ResultatTestPush, Role, TypeNotification, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import type { MessageNotification } from "./messages";
import { PushService } from "./push.service";
import { AlertesStockService } from "./alertes-stock.service";

export interface EmissionNotification extends MessageNotification {
  hotelId: string;
  /** Rôles qui voient (et reçoivent en push) cette notification — jamais « tout le monde ». */
  roles: Role[];
  /** Même clé = même alerte : n'est émise qu'une fois pour cet hôtel (ex. `depart:<reservationId>`). */
  cleDedup?: string;
}

const LIMITE_PAR_DEFAUT = 50;
const JOURS_CONSERVATION_NOTIFICATIONS = 60;
const JOURS_CONSERVATION_APPAREILS = 90;

const enRole = (role: Role): RolePrisma => role as unknown as RolePrisma;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly push: PushService,
    private readonly alertesStock: AlertesStockService
  ) {}

  /**
   * Enregistre une notification pour UN hôtel et l'envoie en push aux appareils de cet hôtel dont
   * le rôle est ciblé. **Ne lève jamais** : une notification ratée ne doit jamais faire échouer
   * l'action métier qui l'a déclenchée (réservation, vente, annulation…).
   */
  async emettre(emission: EmissionNotification): Promise<void> {
    try {
      let creee;
      try {
        creee = await this.prisma.notification.create({
          data: {
            hotelId: emission.hotelId,
            type: emission.type,
            titre: emission.titre,
            corps: emission.corps,
            roles: emission.roles.map(enRole),
            lien: emission.lien as unknown as Prisma.InputJsonValue,
            cleDedup: emission.cleDedup,
          },
        });
      } catch (erreur) {
        // P2002 sur (hotelId, cleDedup) : alerte déjà émise, ce n'est pas une erreur.
        if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") return;
        throw erreur;
      }

      // Alerte de stock : celui qui l'a coupée (ce produit, ou tout) ne reçoit pas la notification sonore.
      const ayantCoupe =
        emission.type === "STOCK_BAS" || emission.type === "STOCK_EPUISE"
          ? await this.alertesStock.utilisateursAyantCoupe(emission.hotelId, emission.lien.id)
          : new Set<string>();
      const appareils = await this.prisma.appareilPush.findMany({
        where: {
          hotelId: emission.hotelId,
          actif: true,
          utilisateur: { actif: true, role: { in: emission.roles.map(enRole) }, ...(ayantCoupe.size > 0 ? { id: { notIn: [...ayantCoupe] } } : {}) },
        },
        select: { jeton: true },
      });
      if (appareils.length === 0) return;

      const { invalides } = await this.push.envoyer(
        appareils.map((a) => a.jeton),
        { id: creee.id, type: emission.type, titre: emission.titre, corps: emission.corps, lien: emission.lien }
      );
      if (invalides.length > 0) {
        await this.prisma.appareilPush.deleteMany({ where: { jeton: { in: invalides } } });
      }
    } catch (erreur) {
      this.logger.error(`Notification ${emission.type} non émise : ${(erreur as Error).message}`);
    }
  }

  /** Notifications de MON hôtel destinées à MON rôle (le `hotelId` vient du jeton, jamais du client). */
  async lister(utilisateur: UtilisateurAuthentifie, options: { depuis?: string; limite?: number }): Promise<ListeNotifications> {
    const portee: Prisma.NotificationWhereInput = { hotelId: utilisateur.hotelId, roles: { has: enRole(utilisateur.role) } };
    const [lignes, nonLues] = await Promise.all([
      this.prisma.notification.findMany({
        where: { ...portee, ...(options.depuis ? { createdAt: { gt: new Date(options.depuis) } } : {}) },
        orderBy: { createdAt: "desc" },
        take: Math.min(options.limite ?? LIMITE_PAR_DEFAUT, 100),
        include: { lectures: { where: { utilisateurId: utilisateur.userId }, select: { utilisateurId: true } } },
      }),
      this.prisma.notification.count({ where: { ...portee, lectures: { none: { utilisateurId: utilisateur.userId } } } }),
    ]);

    const notifications: NotificationApp[] = lignes.map((n) => ({
      id: n.id,
      type: n.type as TypeNotification,
      titre: n.titre,
      corps: n.corps,
      lien: n.lien as unknown as LienNotification,
      createdAt: n.createdAt.toISOString(),
      lue: n.lectures.length > 0,
    }));
    return { notifications, nonLues };
  }

  async marquerLue(utilisateur: UtilisateurAuthentifie, id: string): Promise<void> {
    // Même portée que la liste : impossible de marquer (ni de deviner) la notification d'un autre hôtel ou d'un autre rôle.
    const notification = await this.prisma.notification.findFirst({
      where: { id, hotelId: utilisateur.hotelId, roles: { has: enRole(utilisateur.role) } },
      select: { id: true },
    });
    if (!notification) throw new NotFoundException("Notification introuvable.");
    await this.prisma.notificationLue.createMany({ data: [{ notificationId: id, utilisateurId: utilisateur.userId }], skipDuplicates: true });
  }

  async marquerToutesLues(utilisateur: UtilisateurAuthentifie): Promise<void> {
    const nonLues = await this.prisma.notification.findMany({
      where: { hotelId: utilisateur.hotelId, roles: { has: enRole(utilisateur.role) }, lectures: { none: { utilisateurId: utilisateur.userId } } },
      select: { id: true },
      take: 500,
    });
    if (nonLues.length === 0) return;
    await this.prisma.notificationLue.createMany({
      data: nonLues.map((n) => ({ notificationId: n.id, utilisateurId: utilisateur.userId })),
      skipDuplicates: true,
    });
  }

  /** Un téléphone appartient à l'utilisateur CONNECTÉ : s'il change de main (téléphone partagé), le jeton change de propriétaire. */
  async enregistrerAppareil(utilisateur: UtilisateurAuthentifie, jeton: string, plateforme: string): Promise<void> {
    await this.prisma.appareilPush.upsert({
      where: { jeton },
      create: { jeton, plateforme, hotelId: utilisateur.hotelId, utilisateurId: utilisateur.userId },
      update: { plateforme, hotelId: utilisateur.hotelId, utilisateurId: utilisateur.userId, actif: true, derniereVueLe: new Date() },
    });
  }

  async retirerAppareil(utilisateur: UtilisateurAuthentifie, jeton: string): Promise<void> {
    await this.prisma.appareilPush.deleteMany({ where: { jeton, hotelId: utilisateur.hotelId } });
  }

  /**
   * Annonce une nouvelle version de l'application à TOUS les téléphones enregistrés (écran verrouillé compris). Une seule fois par version et par hôtel :
   * la trace est une notification SANS rôle (donc jamais affichée dans la cloche) dont la clé `maj:<version>` est unique. Ne lève jamais.
   */
  async annoncerMiseAJour(version: string): Promise<{ hotels: number; appareils: number }> {
    const resultat = { hotels: 0, appareils: 0 };
    try {
      const titre = "Nouvelle version de HotelSaver";
      const corps = `La version ${version} est disponible. Touchez pour la télécharger : l'application se met à jour sans repasser par le site.`;
      const lien: LienNotification = { ecran: "mise-a-jour", id: version };
      const hotels = await this.prisma.hotel.findMany({ where: { statutLicence: { in: ["ESSAI", "ACTIF"] } }, select: { id: true } });
      const jetons: string[] = [];
      for (const hotel of hotels) {
        try {
          await this.prisma.notification.create({
            data: { hotelId: hotel.id, type: "MISE_A_JOUR", titre, corps, roles: [], lien: lien as unknown as Prisma.InputJsonValue, cleDedup: `maj:${version}` },
          });
        } catch (erreur) {
          if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") continue; // déjà annoncée à cet hôtel
          throw erreur;
        }
        resultat.hotels += 1;
        const appareils = await this.prisma.appareilPush.findMany({ where: { hotelId: hotel.id, actif: true, utilisateur: { actif: true } }, select: { jeton: true } });
        jetons.push(...appareils.map((a) => a.jeton));
      }
      resultat.appareils = jetons.length;
      if (jetons.length > 0) {
        const { invalides } = await this.push.envoyer(jetons, { id: `maj-${version}`, type: "MISE_A_JOUR", titre, corps, lien });
        if (invalides.length > 0) await this.prisma.appareilPush.deleteMany({ where: { jeton: { in: invalides } } });
      }
    } catch (erreur) {
      this.logger.error(`Annonce de la version ${version} échouée : ${(erreur as Error).message}`);
    }
    return resultat;
  }

  /** Diagnostic : le serveur peut-il envoyer des push, combien de téléphones ai-je enregistrés, et CE téléphone (`jeton`) l'est-il ? */
  async etatPush(utilisateur: UtilisateurAuthentifie, jeton?: string): Promise<EtatPushNotifications> {
    const [appareils, cet] = await Promise.all([
      this.prisma.appareilPush.count({ where: { hotelId: utilisateur.hotelId, utilisateurId: utilisateur.userId, actif: true } }),
      jeton ? this.prisma.appareilPush.count({ where: { jeton, hotelId: utilisateur.hotelId, utilisateurId: utilisateur.userId, actif: true } }) : Promise.resolve(0),
    ]);
    return { serveurPret: this.push.estActif(), appareils, ...(jeton ? { cetAppareilEnregistre: cet > 0 } : {}) };
  }

  /** Envoie UNE notification de test à MES téléphones (pas aux autres) : prouve que la chaîne complète marche, application fermée comprise. */
  async testerPush(utilisateur: UtilisateurAuthentifie): Promise<ResultatTestPush> {
    const serveurPret = this.push.estActif();
    const appareils = await this.prisma.appareilPush.findMany({
      where: { hotelId: utilisateur.hotelId, utilisateurId: utilisateur.userId, actif: true },
      select: { jeton: true },
    });
    if (!serveurPret) return { serveurPret, appareils: appareils.length, envoyes: 0, raison: "SERVEUR_NON_CONFIGURE" };
    if (appareils.length === 0) return { serveurPret, appareils: 0, envoyes: 0, raison: "AUCUN_APPAREIL" };
    const { envoyes, invalides } = await this.push.envoyer(
      appareils.map((a) => a.jeton),
      {
        id: `test-${Date.now()}`,
        type: "TEST_NOTIFICATION",
        titre: "Test des notifications",
        corps: "Si vous lisez ceci, les notifications arrivent bien, même écran verrouillé.",
        lien: { ecran: "tableau-de-bord" },
      }
    );
    if (invalides.length > 0) await this.prisma.appareilPush.deleteMany({ where: { jeton: { in: invalides } } });
    return { serveurPret, appareils: appareils.length, envoyes, raison: envoyes > 0 ? null : "ENVOI_REFUSE" };
  }

  /** Ménage quotidien (03:00) : l'historique ne grossit pas indéfiniment, les jetons abandonnés disparaissent. */
  @Cron("0 3 * * *", { timeZone: "Africa/Lubumbashi" })
  async nettoyer(): Promise<void> {
    try {
      const jour = 24 * 60 * 60 * 1000;
      await this.prisma.notification.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - JOURS_CONSERVATION_NOTIFICATIONS * jour) } } });
      await this.prisma.appareilPush.deleteMany({ where: { derniereVueLe: { lt: new Date(Date.now() - JOURS_CONSERVATION_APPAREILS * jour) } } });
    } catch (erreur) {
      this.logger.error(`Ménage des notifications échoué : ${(erreur as Error).message}`);
    }
  }
}
