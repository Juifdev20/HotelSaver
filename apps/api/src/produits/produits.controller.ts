import { Controller, Get, UseGuards } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";

/**
 * Stub Phase 1 : prouve le contrôle d'accès par rôle (section 9.3).
 * La gestion réelle du menu/produits arrive en Phase 3 (section 16).
 */
@Controller("produits")
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class ProduitsController {
  @Get()
  @Roles(Role.CAFETARIA, Role.PATRON)
  findAll() {
    return {
      message: "Module Produits non implémenté (Phase 3). Route stub protégée par rôle.",
    };
  }
}
