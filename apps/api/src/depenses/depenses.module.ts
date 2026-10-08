import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MediaModule } from "../media/media.module";
import { DepensesController } from "./depenses.controller";
import { DepensesService } from "./depenses.service";

@Module({
  // MediaModule exporte SupabaseStorageService (PDF dans le bucket `rapports`).
  imports: [PrismaModule, MediaModule],
  controllers: [DepensesController],
  providers: [DepensesService],
  // Exporté pour la synchronisation hors ligne (sync.service.ts).
  exports: [DepensesService],
})
export class DepensesModule {}
