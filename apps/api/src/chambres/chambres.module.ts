import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ChambresController } from "./chambres.controller";

@Module({
  imports: [PrismaModule],
  controllers: [ChambresController],
})
export class ChambresModule {}
