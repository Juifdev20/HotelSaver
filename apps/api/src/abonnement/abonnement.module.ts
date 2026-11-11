import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AbonnementController } from "./abonnement.controller";
import { AbonnementService } from "./abonnement.service";
import { AbonnementSchedulerService } from "./abonnement-scheduler.service";
import { SupportAbonnementController } from "./support-abonnement.controller";
import { FormulesAdminController } from "./formules-admin.controller";
import { FormulesAdminService } from "./formules-admin.service";
import { LinkPayClient } from "./linkpay.client";
import { LicencesAdminController } from "./licences-admin.controller";
import { LicencesAdminService } from "./licences-admin.service";

@Module({
  imports: [PrismaModule],
  controllers: [AbonnementController, SupportAbonnementController, FormulesAdminController, LicencesAdminController],
  providers: [FormulesAdminService, AbonnementService, AbonnementSchedulerService, LinkPayClient, LicencesAdminService],
  exports: [AbonnementService, LinkPayClient],
})
export class AbonnementModule {}
