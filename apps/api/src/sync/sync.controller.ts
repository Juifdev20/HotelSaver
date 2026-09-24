import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SyncService } from "./sync.service";
import { SyncPushDto } from "./dto/sync-push.dto";
import { SyncPullQueryDto } from "./dto/sync-pull.query.dto";

/**
 * Section 10.3. RECEPTIONNISTE et CAFETARIA sont les rôles qui utilisent
 * réellement des appareils hors ligne (section 1) ; PATRON peut aussi
 * pousser/tirer (cohérent avec "accès total", voir DECISIONS.md), même si
 * son app est décrite comme "lecture principalement".
 */
@Controller("sync")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post("push")
  push(@Body() dto: SyncPushDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.syncService.push(dto, currentUser);
  }

  @Get("pull")
  pull(@Query() query: SyncPullQueryDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.syncService.pull(query, currentUser);
  }
}
