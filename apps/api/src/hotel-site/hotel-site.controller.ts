import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";
import type { UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { HotelSiteService } from "./hotel-site.service";
import { ModifierSiteDto } from "./dto/modifier-site.dto";

/** Le site public de l'hôtel est défini par le PATRON depuis son compte. */
@Controller("hotel-site")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.PATRON)
export class HotelSiteController {
  constructor(private readonly hotelSiteService: HotelSiteService) {}

  @Get()
  obtenir(@CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.hotelSiteService.obtenir(currentUser.hotelId);
  }

  @Put()
  modifier(@Body() dto: ModifierSiteDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.hotelSiteService.modifier(currentUser.hotelId, dto);
  }
}
