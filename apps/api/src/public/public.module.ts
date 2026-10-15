import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AcompteModule } from "../acompte/acompte.module";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";
import { SupabaseAdminService } from "../common/supabase-admin/supabase-admin.service";

@Module({
  imports: [PrismaModule, AcompteModule],
  controllers: [PublicController],
  providers: [PublicService, SupabaseAdminService],
})
export class PublicModule {}
