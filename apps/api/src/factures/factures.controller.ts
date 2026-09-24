import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
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
  findAll(@Query("reservationId") reservationId?: string) {
    return this.facturesService.findAll(reservationId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.facturesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateFactureDto) {
    return this.facturesService.create(dto);
  }

  @Post(":id/annuler")
  annuler(@Param("id") id: string, @Body() dto: AnnulerFactureDto) {
    return this.facturesService.annuler(id, dto);
  }
}
