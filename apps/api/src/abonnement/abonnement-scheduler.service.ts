import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AbonnementService } from "./abonnement.service";

/** Filet de sécurité : même si le patron ferme l'application avant la confirmation, le paiement est crédité dès que ScanLinkPay le confirme. */
@Injectable()
export class AbonnementSchedulerService {
  private readonly logger = new Logger(AbonnementSchedulerService.name);
  private enCours = false;

  constructor(private readonly abonnement: AbonnementService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async rapprocher(): Promise<void> {
    if (this.enCours) return;
    this.enCours = true;
    try {
      await this.abonnement.rapprocherEnAttente();
    } catch (e) {
      this.logger.error(`Rapprochement des paiements d'abonnement : ${(e as Error).message}`);
    } finally {
      this.enCours = false;
    }
  }
}
