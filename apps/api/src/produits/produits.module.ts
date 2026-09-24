import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ProduitsController } from "./produits.controller";
import { ProduitsService } from "./produits.service";

@Module({
  imports: [PrismaModule],
  controllers: [ProduitsController],
  providers: [ProduitsService],
})
export class ProduitsModule {}
