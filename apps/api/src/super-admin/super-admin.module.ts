import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SuperAdminController } from "./super-admin.controller";
import { ConditionsAdminController } from "./conditions-admin.controller";
import { SuperAdminService } from "./super-admin.service";
import { LicenceSchedulerService } from "./licence-scheduler.service";
import { RenderDomainsService } from "./render-domains.service";
import { UtilisateursService } from "../utilisateurs/utilisateurs.service";
import { SupabaseAdminService } from "../common/supabase-admin/supabase-admin.service";
import { SupabaseStorageService } from "../common/supabase-storage/supabase-storage.service";
import { NettoyageEssaisService } from "./nettoyage-essais.service";

@Module({
  imports: [PrismaModule],
  controllers: [SuperAdminController, ConditionsAdminController],
  providers: [SuperAdminService, LicenceSchedulerService, RenderDomainsService, UtilisateursService, SupabaseAdminService, SupabaseStorageService, NettoyageEssaisService],
})
export class SuperAdminModule {}
