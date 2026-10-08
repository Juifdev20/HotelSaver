import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthProxyController } from "./auth-proxy.controller";

@Module({
  imports: [PrismaModule],
  controllers: [AuthController, AuthProxyController],
})
export class AuthModule {}
