import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { ProduitsService } from "./produits.service";
import { CreateProduitDto } from "./dto/create-produit.dto";
import { UpdateProduitDto } from "./dto/update-produit.dto";
import { FindProduitsQueryDto } from "./dto/find-produits.query.dto";

/**
 * Permissions (section 9.3 "Menu cafétaria") : RECEPTIONNISTE n'a aucun
 * accès ; CAFETARIA lecture seule ; PATRON gère le menu (créer/modifier/
 * supprimer). Contrairement à Réservations/Factures, ce n'est pas un cas où
 * "PATRON : accès total" doit s'étendre à CAFETARIA — la matrice restreint
 * ici une action précise (gestion du menu) à PATRON seul, sans ambiguïté.
 */
@Controller("produits")
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class ProduitsController {
  constructor(private readonly produitsService: ProduitsService) {}

  @Get()
  @Roles(Role.CAFETARIA, Role.PATRON)
  findAll(@Query() query: FindProduitsQueryDto) {
    return this.produitsService.findAll(query);
  }

  @Get(":id")
  @Roles(Role.CAFETARIA, Role.PATRON)
  findOne(@Param("id") id: string) {
    return this.produitsService.findOne(id);
  }

  @Post()
  @Roles(Role.PATRON)
  create(@Body() dto: CreateProduitDto) {
    return this.produitsService.create(dto);
  }

  @Patch(":id")
  @Roles(Role.PATRON)
  update(@Param("id") id: string, @Body() dto: UpdateProduitDto) {
    return this.produitsService.update(id, dto);
  }

  @Delete(":id")
  @Roles(Role.PATRON)
  remove(@Param("id") id: string) {
    return this.produitsService.remove(id);
  }
}
