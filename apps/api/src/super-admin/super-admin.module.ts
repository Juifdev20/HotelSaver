import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SuperAdminController } from "./super-admin.controller";
import { SuperAdminService } from "./super-admin.service";
import { LicenceSchedulerService } from "./licence-scheduler.service";

@Module({
  imports: [PrismaModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, LicenceSchedulerService],
})
export class SuperAdminModule {}
