import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { StockModule } from "../stock/stock.module";
import { CafeteriaController } from "./cafeteria.controller";
import { CafeteriaService } from "./cafeteria.service";

@Module({
  imports: [PrismaModule, StockModule],
  controllers: [CafeteriaController],
  providers: [CafeteriaService],
  exports: [CafeteriaService],
})
export class CafeteriaModule {}
