import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SupabaseAdminService } from "../common/supabase-admin/supabase-admin.service";
import { UtilisateursController } from "./utilisateurs.controller";
import { UtilisateursService } from "./utilisateurs.service";

@Module({
  imports: [PrismaModule],
  controllers: [UtilisateursController],
  providers: [UtilisateursService, SupabaseAdminService],
})
export class UtilisateursModule {}
