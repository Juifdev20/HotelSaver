import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";
import type { UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SuppressionHotelService } from "./suppression-hotel.service";
import { SupprimerHotelDto } from "./dto/supprimer-hotel.dto";

/** Suppression du compte du patron et de son hôtel (PATRON seul ; réception et cafétéria reçoivent 403). */
@Controller("hotel/suppression")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.PATRON)
export class SuppressionHotelController {
  constructor(private readonly suppression: SuppressionHotelService) {}

  /** Ce qui reste à faire avant (clients présents, réservations à venir, remboursements) — vide = possible maintenant. */
  @Get()
  etat(@CurrentUser() utilisateur: UtilisateurAuthentifie) {
    return this.suppression.etat(utilisateur.hotelId);
  }

  @Post()
  @HttpCode(200)
  supprimer(@Body() dto: SupprimerHotelDto, @CurrentUser() utilisateur: UtilisateurAuthentifie) {
    return this.suppression.supprimer(utilisateur.hotelId, utilisateur.nom, dto);
  }
}
