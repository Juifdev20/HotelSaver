import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationsController } from "./notifications.controller";
import { DashboardService } from "../dashboard/dashboard.service";
import { NotificationsSchedulerService } from "./notifications-scheduler.service";
import { NotificationsService } from "./notifications.service";
import { PushService } from "./push.service";

/**
 * Global : tout service métier (réservations, stock, factures…) injecte `NotificationsService`
 * sans importer ce module — émettre une alerte doit rester une ligne dans le code appelant.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService, NotificationsSchedulerService, DashboardService],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}