import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ReglagesHotelController } from "./reglages-hotel.controller";
import { ReglagesHotelService } from "./reglages-hotel.service";

@Module({
  imports: [PrismaModule],
  controllers: [ReglagesHotelController],
  providers: [ReglagesHotelService],
})
export class ReglagesHotelModule {}
