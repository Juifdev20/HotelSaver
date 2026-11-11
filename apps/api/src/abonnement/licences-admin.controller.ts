import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { SuperAdminAuthentifie } from "@hotel-chicago/types";
import { SuperAdminAuthGuard } from "../common/guards/super-admin-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AnnulerPaiementDto } from "../super-admin/dto/annuler-paiement.dto";
import { LicencesAdminService } from "./licences-admin.service";
import { ActiverLicenceDto, EnregistrerMaintenanceDto } from "./dto/licence.dto";

/** Licences de 1, 2 ou 3 ans et frais de maintenance : réservé au SUPER-ADMIN (écran « Licence » de la fiche d'un hôtel). */
@Controller("super-admin/hotels")
@UseGuards(SuperAdminAuthGuard)
export class LicencesAdminController {
  constructor(private readonly service: LicencesAdminService) {}

  @Get(":id/licences")
  lister(@Param("id") id: string) {
    return this.service.lister(id);
  }

  @Post(":id/licences")
  activer(@Param("id") id: string, @Body() dto: ActiverLicenceDto, @CurrentUser() admin: SuperAdminAuthentifie) {
    return this.service.activer(id, dto, admin.id);
  }

  @Post(":id/licences/:licenceId/annuler")
  annuler(@Param("id") id: string, @Param("licenceId") licenceId: string, @Body() dto: AnnulerPaiementDto, @CurrentUser() admin: SuperAdminAuthentifie) {
    return this.service.annuler(id, licenceId, dto.motif, admin.id);
  }

  @Post(":id/maintenance")
  enregistrerMaintenance(@Param("id") id: string, @Body() dto: EnregistrerMaintenanceDto, @CurrentUser() admin: SuperAdminAuthentifie) {
    return this.service.enregistrerMaintenance(id, dto, admin.id);
  }

  @Post(":id/maintenance/:paiementId/annuler")
  annulerMaintenance(@Param("id") id: string, @Param("paiementId") paiementId: string, @Body() dto: AnnulerPaiementDto, @CurrentUser() admin: SuperAdminAuthentifie) {
    return this.service.annulerMaintenance(id, paiementId, dto.motif, admin.id);
  }
}
