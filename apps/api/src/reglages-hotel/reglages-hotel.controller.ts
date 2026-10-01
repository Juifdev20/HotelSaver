import { Body, Controller, Patch, UseGuards } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";
import type { UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ReglagesHotelService } from "./reglages-hotel.service";
import { ModifierReglagesDto } from "./dto/modifier-reglages.dto";

/** Réglages de l'hôtel, modifiables par le PATRON seul (la valeur se lit dans GET /auth/me). */
@Controller("hotel/reglages")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.PATRON)
export class ReglagesHotelController {
  constructor(private readonly reglagesService: ReglagesHotelService) {}

  @Patch()
  modifier(@Body() dto: ModifierReglagesDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.reglagesService.modifier(currentUser.hotelId, dto);
  }
}
