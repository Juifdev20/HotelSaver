import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { TauxChangeService } from "./taux-change.service";
import { CreateTauxChangeDto } from "./dto/create-taux-change.dto";

/**
 * Taux de change USD/CDF (section 9.4) : lecture ouverte à tous les rôles —
   * les écrans d'encaissement (réception ET cafétaria) en ont besoin pour
   * afficher l'aperçu de la monnaie à rendre. Écriture réservée au PATRON. */
@Controller("taux-change")
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class TauxChangeController {
  constructor(private readonly tauxChangeService: TauxChangeService) {}

  @Get("actuel")
  @Roles(Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON)
  actuel(@CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.tauxChangeService.actuel(currentUser.hotelId);
  }

  @Get()
  @Roles(Role.PATRON)
  historique(@CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.tauxChangeService.historique(currentUser.hotelId);
  }

  @Post()
  @Roles(Role.PATRON)
  create(@Body() dto: CreateTauxChangeDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.tauxChangeService.create(dto, currentUser);
  }
}
