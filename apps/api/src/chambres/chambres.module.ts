import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ChambresController } from "./chambres.controller";
import { ChambresService } from "./chambres.service";

@Module({
  imports: [PrismaModule],
  controllers: [ChambresController],
  providers: [ChambresService],
  exports: [ChambresService],
})
export class ChambresModule {}
