import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AbonnementModule } from "../abonnement/abonnement.module";
import { PaiementEnLigneController, RemboursementsController } from "./paiement-en-ligne.controller";
import { PaiementReservationService } from "./paiement-reservation.service";
import { PaiementReservationSchedulerService } from "./paiement-reservation-scheduler.service";
import { RemboursementsService } from "./remboursements.service";
import { ReglagesPaiementService } from "./reglages-paiement.service";

@Module({
  imports: [PrismaModule, AbonnementModule],
  controllers: [PaiementEnLigneController, RemboursementsController],
  providers: [PaiementReservationService, PaiementReservationSchedulerService, RemboursementsService, ReglagesPaiementService],
  exports: [PaiementReservationService, RemboursementsService],
})
export class AcompteModule {}
