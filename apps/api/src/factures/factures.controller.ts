import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { FacturesService } from "./factures.service";
import { CreateFactureDto } from "./dto/create-facture.dto";
import { AnnulerFactureDto } from "./dto/annuler-facture.dto";

/**
 * Permissions (section 9.3 "Facture séjour", lue avec la section 9.1 —
 * voir DECISIONS.md) : RECEPTIONNISTE et PATRON ont tous deux accès à
 * toutes les actions. CAFETARIA n'a aucun accès à ce module.
 */
@Controller("factures")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.RECEPTIONNISTE, Role.PATRON)
export class FacturesController {
  constructor(private readonly facturesService: FacturesService) {}

  @Get()
  findAll(@Query("reservationId") reservationId: string | undefined, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.facturesService.findAll(currentUser.hotelId, reservationId);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.facturesService.findOne(id, currentUser.hotelId);
  }

  @Post()
  create(@Body() dto: CreateFactureDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.facturesService.create(dto, currentUser.hotelId);
  }

  @Post(":id/annuler")
  annuler(@Param("id") id: string, @Body() dto: AnnulerFactureDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.facturesService.annuler(id, dto, currentUser.hotelId);
  }
}
