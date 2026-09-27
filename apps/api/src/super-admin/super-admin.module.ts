import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SuperAdminController } from "./super-admin.controller";
import { SuperAdminService } from "./super-admin.service";
import { LicenceSchedulerService } from "./licence-scheduler.service";
import { RenderDomainsService } from "./render-domains.service";

@Module({
  imports: [PrismaModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, LicenceSchedulerService, RenderDomainsService],
})
export class SuperAdminModule {}
