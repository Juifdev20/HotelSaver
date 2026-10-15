import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PaiementReservationService } from "./paiement-reservation.service";

/** Filet de sécurité : un acompte confirmé alors que le client a fermé la page est quand même crédité dans la minute. */
@Injectable()
export class PaiementReservationSchedulerService {
  private readonly logger = new Logger(PaiementReservationSchedulerService.name);
  private enCours = false;

  constructor(private readonly paiements: PaiementReservationService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async rapprocher(): Promise<void> {
    if (this.enCours) return;
    this.enCours = true;
    try {
      await this.paiements.rapprocherEnAttente();
    } catch (e) {
      this.logger.error(`Rapprochement des acomptes : ${(e as Error).message}`);
    } finally {
      this.enCours = false;
    }
  }
}
