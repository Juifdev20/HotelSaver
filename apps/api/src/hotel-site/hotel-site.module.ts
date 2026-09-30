import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MediaModule } from "../media/media.module";
import { HotelSiteController } from "./hotel-site.controller";
import { HotelSiteService } from "./hotel-site.service";

@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [HotelSiteController],
  providers: [HotelSiteService],
})
export class HotelSiteModule {}
