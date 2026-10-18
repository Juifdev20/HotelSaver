import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SuperAdminAuthentifie } from "@hotel-chicago/types";
import { SuperAdminAuthGuard } from "../common/guards/super-admin-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SuperAdminService } from "./super-admin.service";
import { CreerHotelDto } from "./dto/creer-hotel.dto";
import { ChangerStatutHotelDto } from "./dto/changer-statut-hotel.dto";
import { EnregistrerPaiementDto } from "./dto/enregistrer-paiement.dto";
import { AjouterDomaineDto } from "./dto/ajouter-domaine.dto";
import { ModifierPatronDto } from "./dto/modifier-patron.dto";
import { AnnulerPaiementDto } from "./dto/annuler-paiement.dto";
import { UtilisateursService } from "../utilisateurs/utilisateurs.service";

/**
 * Réservé aux comptes SuperAdmin (voir DECISIONS.md, Phase 3) — pas de
 * RolesGuard ici, un seul niveau de super-admin pour l'instant.
 */
@Controller("super-admin/hotels")
@UseGuards(SuperAdminAuthGuard)
export class SuperAdminController {
  constructor(
    private readonly superAdminService: SuperAdminService,
    private readonly utilisateurs: UtilisateursService
  ) {}

  @Get()
  findAll() {
    return this.superAdminService.findAllHotels();
  }

  @Post()
  creerHotel(@Body() dto: CreerHotelDto) {
    return this.superAdminService.creerHotel(dto);
  }

  @Patch(":id/statut")
  changerStatut(@Param("id") id: string, @Body() dto: ChangerStatutHotelDto) {
    return this.superAdminService.changerStatut(id, dto);
  }

  @Post(":id/paiements")
  enregistrerPaiement(
    @Param("id") id: string,
    @Body() dto: EnregistrerPaiementDto,
    @CurrentUser() currentUser: SuperAdminAuthentifie
  ) {
    return this.superAdminService.enregistrerPaiement(id, dto, currentUser.id);
  }

  @Get(":id/paiements")
  listerPaiements(@Param("id") id: string) {
    return this.superAdminService.listerPaiements(id);
  }

  /** Annule un paiement saisi à la main (motif obligatoire) — jamais un paiement en ligne réel (17/10/2026). */
  @Post(":id/paiements/:paiementId/annuler")
  annulerPaiement(
    @Param("id") id: string,
    @Param("paiementId") paiementId: string,
    @Body() dto: AnnulerPaiementDto,
    @CurrentUser() currentUser: SuperAdminAuthentifie
  ) {
    return this.superAdminService.annulerPaiement(id, paiementId, dto, currentUser.id);
  }

  /** Numéro de connexion et/ou nouveau mot de passe du patron (15/10/2026) —
   * mêmes règles que la modification d'un compte par le patron
   * (UtilisateursService.update), appliquées au patron de l'hôtel. */
  @Patch(":id/patron")
  async modifierPatron(@Param("id") id: string, @Body() dto: ModifierPatronDto) {
    if (dto.telephone === undefined && dto.motDePasse === undefined) {
      throw new BadRequestException("Indiquez un numéro ou un nouveau mot de passe.");
    }
    const patron = await this.superAdminService.trouverPatron(id);
    return this.utilisateurs.update(patron.id, dto, { userId: "super-admin", hotelId: id } as never);
  }

  @Post(":id/domaine")
  ajouterDomaine(@Param("id") id: string, @Body() dto: AjouterDomaineDto) {
    return this.superAdminService.ajouterDomainePersonnalise(id, dto);
  }

  @Post(":id/domaine/verifier")
  verifierDomaine(@Param("id") id: string) {
    return this.superAdminService.verifierDomainePersonnalise(id);
  }

  @Delete(":id/domaine")
  retirerDomaine(@Param("id") id: string) {
    return this.superAdminService.retirerDomainePersonnalise(id);
  }
}
