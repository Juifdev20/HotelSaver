import { Controller, Get, UseGuards } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";

/**
 * Stub Phase 1 : prouve le contrôle d'accès par rôle (section 9.3).
 * La gestion réelle des chambres arrive en Phase 2 (section 16).
 */
@Controller("chambres")
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class ChambresController {
  @Get()
  @Roles(Role.RECEPTIONNISTE, Role.PATRON)
  findAll() {
    return {
      message: "Module Chambres non implémenté (Phase 2). Route stub protégée par rôle.",
    };
  }
}
