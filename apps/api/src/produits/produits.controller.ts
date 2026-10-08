import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ProduitsService } from "./produits.service";
import { CreateProduitDto } from "./dto/create-produit.dto";
import { UpdateProduitDto } from "./dto/update-produit.dto";
import { FindProduitsQueryDto } from "./dto/find-produits.query.dto";
import { AssocierCodeBarresDto } from "./dto/code-barres";

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
  findAll(@Query() query: FindProduitsQueryDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.produitsService.findAll(query, currentUser.hotelId);
  }

  @Get(":id")
  @Roles(Role.CAFETARIA, Role.PATRON)
  findOne(@Param("id") id: string, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.produitsService.findOne(id, currentUser.hotelId);
  }

  @Post()
  @Roles(Role.PATRON)
  create(@Body() dto: CreateProduitDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.produitsService.create(dto, currentUser.hotelId);
  }

  @Patch(":id")
  @Roles(Role.PATRON)
  update(@Param("id") id: string, @Body() dto: UpdateProduitDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.produitsService.update(id, dto, currentUser.hotelId);
  }

  /** Seule écriture ouverte à la cafétaria : associer le code-barres d'un
   * article pendant la vente (scan d'un code inconnu). Le reste de la fiche
   * (prix, nom…) reste réservé au patron. */
  @Patch(":id/code-barres")
  @Roles(Role.CAFETARIA, Role.PATRON)
  associerCodeBarres(
    @Param("id") id: string,
    @Body() dto: AssocierCodeBarresDto,
    @CurrentUser() currentUser: UtilisateurAuthentifie
  ) {
    return this.produitsService.associerCodeBarres(id, dto.codeBarres, currentUser.hotelId);
  }

  @Delete(":id")
  @Roles(Role.PATRON)
  remove(@Param("id") id: string, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.produitsService.remove(id, currentUser.hotelId);
  }
}
