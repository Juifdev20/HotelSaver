import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { StockController } from "./stock.controller";

@Module({
  imports: [PrismaModule],
  controllers: [StockController],
})
export class StockModule {}
