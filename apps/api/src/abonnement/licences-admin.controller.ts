import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { SuperAdminAuthentifie } from "@hotel-chicago/types";
import { SuperAdminAuthGuard } from "../common/guards/super-admin-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AnnulerPaiementDto } from "../super-admin/dto/annuler-paiement.dto";
import { LicencesAdminService } from "./licences-admin.service";
import { ContratsLicenceService, TAILLE_MAX_SCAN } from "./documents-licence/contrats-licence.service";
import { ActiverLicenceDto, EnregistrerMaintenanceDto } from "./dto/licence.dto";

/** Licences de 1, 2 ou 3 ans et frais de maintenance : réservé au SUPER-ADMIN (écran « Licence » de la fiche d'un hôtel). */
@Controller("super-admin/hotels")
@UseGuards(SuperAdminAuthGuard)
export class LicencesAdminController {
  constructor(
    private readonly service: LicencesAdminService,
    private readonly contrats: ContratsLicenceService
  ) {}

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

  /* --- Preuve d'achat (11/11/2026) : contrat, reçus, exemplaire signé, dossier de preuve. Chaque réponse est `{ nom, type, base64 }`. --- */

  @Get(":id/licences/:licenceId/contrat")
  contrat(@Param("id", new ParseUUIDPipe()) id: string, @Param("licenceId", new ParseUUIDPipe()) licenceId: string) {
    return this.contrats.contratPdf(id, licenceId);
  }

  @Get(":id/licences/:licenceId/recu")
  recuLicence(@Param("id", new ParseUUIDPipe()) id: string, @Param("licenceId", new ParseUUIDPipe()) licenceId: string) {
    return this.contrats.recuLicencePdf(id, licenceId);
  }

  @Get(":id/licences/:licenceId/dossier")
  dossier(@Param("id", new ParseUUIDPipe()) id: string, @Param("licenceId", new ParseUUIDPipe()) licenceId: string, @CurrentUser() admin: SuperAdminAuthentifie) {
    return this.contrats.dossierPreuvePdf(id, licenceId, admin.id);
  }

  /** multipart/form-data, champ `fichier` : le contrat signé, numérisé ou photographié (PDF, JPEG ou PNG, 8 Mo au plus). */
  @Post(":id/licences/:licenceId/scan")
  @UseInterceptors(FileInterceptor("fichier", { limits: { fileSize: TAILLE_MAX_SCAN, files: 1 } }))
  envoyerScan(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("licenceId", new ParseUUIDPipe()) licenceId: string,
    @UploadedFile() fichier: Express.Multer.File | undefined,
    @CurrentUser() admin: SuperAdminAuthentifie
  ) {
    if (!fichier) throw new BadRequestException("Aucun fichier reçu (champ « fichier »).");
    return this.contrats.enregistrerScan(id, licenceId, fichier.buffer, admin.id);
  }

  @Get(":id/licences/:licenceId/scan")
  scan(@Param("id", new ParseUUIDPipe()) id: string, @Param("licenceId", new ParseUUIDPipe()) licenceId: string) {
    return this.contrats.scanSigne(id, licenceId);
  }

  @Get(":id/maintenance/:paiementId/recu")
  recuMaintenance(@Param("id", new ParseUUIDPipe()) id: string, @Param("paiementId", new ParseUUIDPipe()) paiementId: string) {
    return this.contrats.recuMaintenancePdf(id, paiementId);
  }
}
