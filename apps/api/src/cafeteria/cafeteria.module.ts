import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CafeteriaController } from "./cafeteria.controller";

@Module({
  imports: [PrismaModule],
  controllers: [CafeteriaController],
})
export class CafeteriaModule {}
