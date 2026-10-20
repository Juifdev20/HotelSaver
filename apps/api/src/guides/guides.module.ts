import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MediaModule } from "../media/media.module";
import { GuidesController } from "./guides.controller";
import { GuidesAdminController } from "./guides-admin.controller";
import { GuidesService } from "./guides.service";

@Module({
  // MediaModule exporte SupabaseStorageService.
  imports: [PrismaModule, MediaModule],
  controllers: [GuidesController, GuidesAdminController],
  providers: [GuidesService],
})
export class GuidesModule {}
