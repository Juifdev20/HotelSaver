import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TauxChangeController } from "./taux-change.controller";
import { TauxChangeService } from "./taux-change.service";

@Module({
  imports: [PrismaModule],
  controllers: [TauxChangeController],
  providers: [TauxChangeService],
})
export class TauxChangeModule {}
