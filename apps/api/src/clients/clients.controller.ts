import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ClientsService } from "./clients.service";
import { ModifierClientDto } from "./dto/modifier-client.dto";

/**
 * Répertoire clients — les clients sont créés implicitement à la création
 * d'une réservation (client inline, voir reservations.service) et jamais
 * supprimés (traçabilité des séjours) ; PATCH complète la fiche (pièce
 * d'identité, notes — registre de police). RECEPTIONNISTE et PATRON
 * (même périmètre que le module Réservations, matrice 9.3).
 */
@Controller("clients")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.RECEPTIONNISTE, Role.PATRON)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  findAll(@Query("q") q: string | undefined, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.clientsService.findAll(currentUser.hotelId, q);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.clientsService.findOne(id, currentUser.hotelId);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: ModifierClientDto,
    @CurrentUser() currentUser: UtilisateurAuthentifie
  ) {
    return this.clientsService.update(id, dto, currentUser.hotelId);
  }
}
