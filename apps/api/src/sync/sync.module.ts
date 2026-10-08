import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ChambresModule } from "../chambres/chambres.module";
import { ReservationsModule } from "../reservations/reservations.module";
import { ProduitsModule } from "../produits/produits.module";
import { StockModule } from "../stock/stock.module";
import { CafeteriaModule } from "../cafeteria/cafeteria.module";
import { DepensesModule } from "../depenses/depenses.module";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";

@Module({
  imports: [PrismaModule, ChambresModule, ReservationsModule, ProduitsModule, StockModule, CafeteriaModule, DepensesModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
