import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MediaModule } from "../media/media.module";
import { RapportsController } from "./rapports.controller";
import { RapportsService } from "./rapports.service";

@Module({
  // MediaModule exporte SupabaseStorageService ; NotificationsService est global.
  imports: [PrismaModule, MediaModule],
  controllers: [RapportsController],
  providers: [RapportsService],
})
export class RapportsModule {}
