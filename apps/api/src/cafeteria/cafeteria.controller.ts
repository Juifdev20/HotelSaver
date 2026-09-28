import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
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
 * n'a aucun accès à ce module, à une exception près — la lecture des ventes
 * liées à un séjour (GET /cafeteria/ventes?reservationLieeId=…), nécessaire
 * à l'aperçu de la facture séjour (section 9.3 "Facture séjour" : la réception
 * encaisse chambre + cafétaria) ; sans ce paramètre elle reçoit 403.
 * CAFETARIA gère tout le cycle de vie normal
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
  findAllComptes(@Query() query: FindComptesQueryDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.cafeteriaService.findAllComptes(query, currentUser.hotelId);
  }

  @Get("comptes/:id")
  findOneCompte(@Param("id") id: string, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.cafeteriaService.findOneCompte(id, currentUser.hotelId);
  }

  @Post("comptes")
  ouvrirCompte(@Body() dto: OuvrirCompteDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.cafeteriaService.ouvrirCompte(dto, currentUser);
  }

  @Post("comptes/:id/sous-comptes")
  ajouterSousCompte(
    @Param("id") id: string,
    @Body() dto: AjouterSousCompteDto,
    @CurrentUser() currentUser: UtilisateurAuthentifie
  ) {
    return this.cafeteriaService.ajouterSousCompte(id, dto, currentUser.hotelId);
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

  /** Seule brèche de la matrice pour RECEPTIONNISTE : les ventes liées à
   * un séjour précis, pour l'aperçu de facturation. Sans `reservationLieeId`
   * (liste globale des ventes), la réception reste dehors. */
  @Get("ventes")
  @Roles(Role.CAFETARIA, Role.PATRON, Role.RECEPTIONNISTE)
  findAllVentes(
    @Query("reservationLieeId") reservationLieeId: string | undefined,
    @CurrentUser() currentUser: UtilisateurAuthentifie
  ) {
    if (currentUser.role === Role.RECEPTIONNISTE && !reservationLieeId) {
      throw new ForbiddenException(
        "La réception ne peut consulter que les ventes liées à un séjour, dans le cadre d'une facturation."
      );
    }
    return this.cafeteriaService.findAllVentes(currentUser.hotelId, reservationLieeId);
  }

  @Post("ventes/:id/annuler")
  @Roles(Role.PATRON)
  annulerVente(@Param("id") id: string, @Body() dto: AnnulerVenteDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.cafeteriaService.annulerVente(id, dto.motif, currentUser.hotelId);
  }
}
