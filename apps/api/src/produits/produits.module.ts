import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ProduitsController } from "./produits.controller";

@Module({
  imports: [PrismaModule],
  controllers: [ProduitsController],
})
export class ProduitsModule {}
