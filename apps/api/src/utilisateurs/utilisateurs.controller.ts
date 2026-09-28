import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { UtilisateursService } from "./utilisateurs.service";
import { CreateUtilisateurDto } from "./dto/create-utilisateur.dto";
import { UpdateUtilisateurDto } from "./dto/update-utilisateur.dto";

/**
 * Gestion des comptes du personnel (Phase 15) — PATRON uniquement, comme
 * "Utilisateurs" dans la matrice 9.3. Remplace le script CLI
 * creer-utilisateur.js pour l'usage courant (celui-ci reste utile pour créer
 * le tout premier compte PATRON d'un hôtel créé manuellement).
 */
@Controller("utilisateurs")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.PATRON)
export class UtilisateursController {
  constructor(private readonly utilisateursService: UtilisateursService) {}

  @Get()
  findAll(@CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.utilisateursService.findAll(currentUser.hotelId);
  }

  @Post()
  create(@Body() dto: CreateUtilisateurDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.utilisateursService.create(dto, currentUser.hotelId);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateUtilisateurDto,
    @CurrentUser() currentUser: UtilisateurAuthentifie
  ) {
    return this.utilisateursService.update(id, dto, currentUser);
  }
}
