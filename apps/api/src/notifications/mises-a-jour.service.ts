import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { miseAJourAndroid, type ReleaseGithub } from "@hotel-chicago/regles";
import { NotificationsService } from "./notifications.service";

const URL_DERNIERE_RELEASE = "https://api.github.com/repos/Juifdev20/HotelSaver/releases/latest";
/** Une release plus ancienne que cela n'est plus « nouvelle » (évite d'annoncer une vieille version au premier démarrage). */
const JOURS_NOUVELLE = 14;

/**
 * Annonce les nouvelles versions (11/11/2026). Toutes les 30 minutes, regarde la dernière release GitHub ; s'il y en a une récente avec son APK, chaque
 * téléphone enregistré reçoit une notification (écran verrouillé compris) qui ouvre l'écran « Mise à jour » de l'application. Une seule annonce par version
 * (trace en base). Seulement en production : un serveur de développement ne doit pas notifier de vrais téléphones.
 */
@Injectable()
export class MisesAJourService {
  private readonly logger = new Logger(MisesAJourService.name);

  constructor(private readonly notifications: NotificationsService) {}

  @Cron("*/30 * * * *")
  async verifier(): Promise<void> {
    if (process.env.NODE_ENV !== "production") return;
    await this.annonceSiNouvelle();
  }

  /** Public pour être testé sans attendre le cron ni le réseau (`lire` remplace l'appel à GitHub). */
  async annonceSiNouvelle(lire: () => Promise<ReleaseGithub | null> = lireDerniereRelease, maintenant = new Date()): Promise<string | null> {
    try {
      const release = await lire();
      // Avec « 0.0.0 » comme version installée, toute release valide (tag lisible, APK joint, ni brouillon ni pré-version) est retenue.
      const maj = miseAJourAndroid(release, "0.0.0");
      if (!maj) return null;
      const publiee = maj.publieeLe ? Date.parse(maj.publieeLe) : NaN;
      if (!Number.isFinite(publiee) || maintenant.getTime() - publiee > JOURS_NOUVELLE * 86_400_000) return null;
      await this.notifications.annoncerMiseAJour(maj.version);
      return maj.version;
    } catch (erreur) {
      this.logger.warn(`Recherche de nouvelle version impossible : ${(erreur as Error).message}`);
      return null;
    }
  }
}

async function lireDerniereRelease(): Promise<ReleaseGithub | null> {
  const reponse = await fetch(URL_DERNIERE_RELEASE, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15_000) });
  if (reponse.status === 404) return null;
  if (!reponse.ok) throw new Error(`GitHub a répondu ${reponse.status}`);
  return (await reponse.json()) as ReleaseGithub;
}
