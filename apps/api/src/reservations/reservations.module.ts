import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AcompteModule } from "../acompte/acompte.module";
import { ReservationsController } from "./reservations.controller";
import { ReservationsService } from "./reservations.service";

@Module({
  imports: [PrismaModule, AcompteModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
