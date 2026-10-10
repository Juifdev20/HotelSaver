import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { FacturesController } from "./factures.controller";
import { FacturesService } from "./factures.service";

@Module({
  imports: [PrismaModule],
  controllers: [FacturesController],
  providers: [FacturesService],
  exports: [FacturesService],
})
export class FacturesModule {}
