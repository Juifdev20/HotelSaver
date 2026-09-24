import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ReservationsController } from "./reservations.controller";

@Module({
  imports: [PrismaModule],
  controllers: [ReservationsController],
})
export class ReservationsModule {}
