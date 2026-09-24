import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { FacturesController } from "./factures.controller";
import { FacturesService } from "./factures.service";

@Module({
  imports: [PrismaModule],
  controllers: [FacturesController],
  providers: [FacturesService],
})
export class FacturesModule {}
