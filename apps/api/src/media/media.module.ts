import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SupabaseStorageService } from "../common/supabase-storage/supabase-storage.service";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";

@Module({
  imports: [PrismaModule],
  controllers: [MediaController],
  providers: [MediaService, SupabaseStorageService],
  exports: [SupabaseStorageService],
})
export class MediaModule {}
