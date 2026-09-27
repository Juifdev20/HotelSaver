import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SuperAdminAuthentifie } from "@hotel-chicago/types";
import { SuperAdminAuthGuard } from "../common/guards/super-admin-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SuperAdminService } from "./super-admin.service";
import { CreerHotelDto } from "./dto/creer-hotel.dto";
import { ChangerStatutHotelDto } from "./dto/changer-statut-hotel.dto";
import { EnregistrerPaiementDto } from "./dto/enregistrer-paiement.dto";

/**
 * Réservé aux comptes SuperAdmin (voir DECISIONS.md, Phase 3) — pas de
 * RolesGuard ici, un seul niveau de super-admin pour l'instant.
 */
@Controller("super-admin/hotels")
@UseGuards(SuperAdminAuthGuard)
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

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
}
