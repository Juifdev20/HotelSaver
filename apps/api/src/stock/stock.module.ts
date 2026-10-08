import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MediaModule } from "../media/media.module";
import { StockController } from "./stock.controller";
import { StockService } from "./stock.service";

@Module({
  // MediaModule exporte SupabaseStorageService (partagé avec RapportsModule)
  imports: [PrismaModule, MediaModule],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
