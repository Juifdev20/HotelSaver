import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AbonnementController } from "./abonnement.controller";
import { AbonnementService } from "./abonnement.service";
import { AbonnementSchedulerService } from "./abonnement-scheduler.service";
import { SupportAbonnementController } from "./support-abonnement.controller";
import { LinkPayClient } from "./linkpay.client";

@Module({
  imports: [PrismaModule],
  controllers: [AbonnementController, SupportAbonnementController],
  providers: [AbonnementService, AbonnementSchedulerService, LinkPayClient],
  exports: [AbonnementService],
})
export class AbonnementModule {}
