import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Operationnel } from "../common/decorators/operationnel.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CafeteriaService } from "./cafeteria.service";
import { OuvrirCompteDto } from "./dto/ouvrir-compte.dto";
import { AjouterSousCompteDto } from "./dto/ajouter-sous-compte.dto";
import { AjouterLigneDto } from "./dto/ajouter-ligne.dto";
import { EncaisserCompteDto } from "./dto/encaisser-compte.dto";
import { FindComptesQueryDto } from "./dto/find-comptes.query.dto";
import { AnnulerVenteDto } from "./dto/annuler-vente.dto";
import { MajStatutLigneDto } from "./dto/maj-statut-ligne.dto";
import { DefinirMenuDuJourDto } from "./dto/definir-menu-du-jour.dto";

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

  @Get("produits-populaires")
  produitsPopulaires(@CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.cafeteriaService.produitsPopulaires(currentUser.hotelId);
  }

  @Get("comptes")
  findAllComptes(@Query() query: FindComptesQueryDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.cafeteriaService.findAllComptes(query, currentUser.hotelId);
  }

  /** Retrait d'une commande web par sa référence courte (ticket client) —
   * DOIT rester avant GET comptes/:id pour ne pas être capturée par le param. */
  @Get("comptes/par-reference/:reference")
  trouverParReference(@Param("reference") reference: string, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.cafeteriaService.trouverCompteParReference(reference, currentUser.hotelId);
  }

  @Get("comptes/:id")
  findOneCompte(@Param("id") id: string, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.cafeteriaService.findOneCompte(id, currentUser.hotelId);
  }

  @Operationnel()
  @Post("comptes")
  ouvrirCompte(@Body() dto: OuvrirCompteDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.cafeteriaService.ouvrirCompte(dto, currentUser);
  }

  @Operationnel()
  @Post("comptes/:id/sous-comptes")
  ajouterSousCompte(
    @Param("id") id: string,
    @Body() dto: AjouterSousCompteDto,
    @CurrentUser() currentUser: UtilisateurAuthentifie
  ) {
    return this.cafeteriaService.ajouterSousCompte(id, dto, currentUser.hotelId);
  }

  @Operationnel()
  @Post("comptes/:id/lignes")
  ajouterLigne(
    @Param("id") id: string,
    @Body() dto: AjouterLigneDto,
    @CurrentUser() currentUser: UtilisateurAuthentifie
  ) {
    return this.cafeteriaService.ajouterLigne(id, dto, currentUser);
  }

  @Operationnel()
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
    return this.cafeteriaService.annulerVente(id, dto.motif, currentUser.hotelId, currentUser);
  }

  // ---------------------------------------------------------------------------
  // Statut de ligne (cycle de vie cuisine)
  // ---------------------------------------------------------------------------

  /** PATCH /cafeteria/lignes/:id/statut — avance le statut d'une ligne (cuisine → salle). */
  @Patch("lignes/:id/statut")
  majStatutLigne(@Param("id") id: string, @Body() dto: MajStatutLigneDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.cafeteriaService.majStatutLigne(id, dto, currentUser.hotelId);
  }

  /** GET /cafeteria/cuisine — lignes EN_ATTENTE + EN_PREPARATION pour l'écran de cuisine. */
  @Get("cuisine")
  lignesPourCuisine(@CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.cafeteriaService.lignesPourCuisine(currentUser);
  }

  // ---------------------------------------------------------------------------
  // Menu du jour
  // ---------------------------------------------------------------------------

  /** GET /cafeteria/menu-du-jour — menu actif pour aujourd'hui, null si non défini. */
  @Get("menu-du-jour")
  menuDuJour(@CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.cafeteriaService.menuDuJour(currentUser.hotelId);
  }

  /** PUT /cafeteria/menu-du-jour — crée ou remplace le menu du jour. */
  @Put("menu-du-jour")
  @Roles(Role.CAFETARIA, Role.PATRON)
  definirMenuDuJour(@Body() dto: DefinirMenuDuJourDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.cafeteriaService.definirMenuDuJour(dto, currentUser);
  }

  /** DELETE /cafeteria/menu-du-jour/items/:itemId — retire un produit du menu du jour. */
  @Delete("menu-du-jour/items/:itemId")
  @Roles(Role.CAFETARIA, Role.PATRON)
  supprimerItemMenu(@Param("itemId") itemId: string, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.cafeteriaService.supprimerItemMenu(itemId, currentUser.hotelId);
  }
}
