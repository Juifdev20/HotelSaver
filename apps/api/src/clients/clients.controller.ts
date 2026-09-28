import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ClientsService } from "./clients.service";

/**
 * Répertoire clients — lecture seule : les clients sont créés implicitement
 * à la création d'une réservation (client inline, voir reservations.service)
 * et jamais supprimés (traçabilité des séjours). RECEPTIONNISTE et PATRON
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
}
