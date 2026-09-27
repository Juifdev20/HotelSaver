import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { SuperAdminService } from "./super-admin.service";

/** Tâche planifiée quotidienne (Phase 12, décision du patron : suspension
 * automatique à l'échéance) — ne fait qu'appeler SuperAdminService.suspendreHotelsExpires(),
 * gardée volontairement testable en dehors de tout vrai déclenchement cron. */
@Injectable()
export class LicenceSchedulerService {
  private readonly logger = new Logger(LicenceSchedulerService.name);

  constructor(private readonly superAdminService: SuperAdminService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async verifierLicencesExpirees(): Promise<void> {
    try {
      await this.superAdminService.suspendreHotelsExpires();
    } catch (erreur) {
      this.logger.error(`Échec de la vérification des licences expirées : ${(erreur as Error).message}`);
    }
  }
}
