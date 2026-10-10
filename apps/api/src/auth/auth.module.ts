import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthProxyController } from "./auth-proxy.controller";
import { MotDePasseController } from "./mot-de-passe.controller";
import { SupabaseAdminService } from "../common/supabase-admin/supabase-admin.service";

@Module({
  imports: [PrismaModule],
  controllers: [AuthController, AuthProxyController, MotDePasseController],
  providers: [SupabaseAdminService],
})
export class AuthModule {}
