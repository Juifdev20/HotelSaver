import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CafeteriaService } from "./cafeteria.service";
import { OuvrirCompteDto } from "./dto/ouvrir-compte.dto";
import { AjouterSousCompteDto } from "./dto/ajouter-sous-compte.dto";
import { AjouterLigneDto } from "./dto/ajouter-ligne.dto";
import { EncaisserCompteDto } from "./dto/encaisser-compte.dto";
import { FindComptesQueryDto } from "./dto/find-comptes.query.dto";
import { AnnulerVenteDto } from "./dto/annuler-vente.dto";

/**
 * Permissions (section 9.3, lignes Comptes/Ventes cafétaria) : RECEPTIONNISTE
 * n'a aucun accès à ce module. CAFETARIA gère tout le cycle de vie normal
 * (ouverture, sous-comptes, lignes, encaissement). PATRON a également accès
 * à toutes ces actions (cohérent avec le traitement de Réservations/Factures,
 * voir DECISIONS.md) mais est SEUL à pouvoir annuler une vente déjà encaissée
 * (section 9.3 : "Ventes cafétaria" ne donne "Annuler avec motif" qu'à PATRON).
 */
@Controller("cafeteria")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.CAFETARIA, Role.PATRON)
export class CafeteriaController {
  constructor(private readonly cafeteriaService: CafeteriaService) {}

  @Get("comptes")
  findAllComptes(@Query() query: FindComptesQueryDto) {
    return this.cafeteriaService.findAllComptes(query);
  }

  @Get("comptes/:id")
  findOneCompte(@Param("id") id: string) {
    return this.cafeteriaService.findOneCompte(id);
  }

  @Post("comptes")
  ouvrirCompte(@Body() dto: OuvrirCompteDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.cafeteriaService.ouvrirCompte(dto, currentUser);
  }

  @Post("comptes/:id/sous-comptes")
  ajouterSousCompte(@Param("id") id: string, @Body() dto: AjouterSousCompteDto) {
    return this.cafeteriaService.ajouterSousCompte(id, dto);
  }

  @Post("comptes/:id/lignes")
  ajouterLigne(
    @Param("id") id: string,
    @Body() dto: AjouterLigneDto,
    @CurrentUser() currentUser: UtilisateurAuthentifie
  ) {
    return this.cafeteriaService.ajouterLigne(id, dto, currentUser);
  }

  @Post("comptes/:id/encaisser")
  encaisser(
    @Param("id") id: string,
    @Body() dto: EncaisserCompteDto,
    @CurrentUser() currentUser: UtilisateurAuthentifie
  ) {
    return this.cafeteriaService.encaisser(id, dto, currentUser);
  }

  @Get("ventes")
  findAllVentes(@Query("reservationLieeId") reservationLieeId?: string) {
    return this.cafeteriaService.findAllVentes(reservationLieeId);
  }

  @Post("ventes/:id/annuler")
  @Roles(Role.PATRON)
  annulerVente(@Param("id") id: string, @Body() dto: AnnulerVenteDto) {
    return this.cafeteriaService.annulerVente(id, dto.motif);
  }
}
