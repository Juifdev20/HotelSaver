import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { GuidesService } from "./guides.service";

/**
 * Guides d'utilisation (20/10/2026) : réservés aux comptes connectés et actifs (SupabaseAuthGuard), filtrés par rôle dans
 * le service. Jamais d'URL publique : chaque ouverture demande un lien signé de 5 minutes.
 */
@Controller("guides")
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class GuidesController {
  constructor(private readonly guides: GuidesService) {}

  @Get()
  @Roles(Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON)
  lister(@CurrentUser() user: UtilisateurAuthentifie) {
    return this.guides.listerPourRole(user.role);
  }

  @Get(":guide/lien")
  @Roles(Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON)
  lien(@CurrentUser() user: UtilisateurAuthentifie, @Param("guide") guide: string) {
    return this.guides.lienPourRole(user.role, guide);
  }
}
