import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ReglagesHotelController } from "./reglages-hotel.controller";
import { ReglagesHotelService } from "./reglages-hotel.service";
import { SuppressionHotelController } from "./suppression-hotel.controller";
import { SuppressionHotelService } from "./suppression-hotel.service";
import { SuperAdminModule } from "../super-admin/super-admin.module";

@Module({
  imports: [PrismaModule, SuperAdminModule],
  controllers: [ReglagesHotelController, SuppressionHotelController],
  providers: [ReglagesHotelService, SuppressionHotelService],
})
export class ReglagesHotelModule {}
