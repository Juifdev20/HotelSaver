import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { SuperAdminAuthentifie } from "@hotel-chicago/types";
import { SuperAdminAuthGuard } from "../common/guards/super-admin-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { GuidesService } from "./guides.service";
import { PreparerEnvoiGuideDto, PublierGuideDto } from "./dto/guides.dto";

/**
 * Publication des guides PDF par le super-admin : 1) `envoi` donne un chemin et une adresse d'envoi à usage unique,
 * 2) le navigateur dépose le PDF directement dans le stockage, 3) `POST` enregistre la nouvelle version.
 */
@Controller("super-admin/guides")
@UseGuards(SuperAdminAuthGuard)
export class GuidesAdminController {
  constructor(private readonly guides: GuidesService) {}

  @Get()
  lister() {
    return this.guides.listerVersions();
  }

  @Post("envoi")
  preparer(@Body() dto: PreparerEnvoiGuideDto) {
    return this.guides.preparerEnvoi(dto.guide);
  }

  @Post()
  publier(@Body() dto: PublierGuideDto, @CurrentUser() superAdmin: SuperAdminAuthentifie) {
    return this.guides.publier(dto.guide, dto.chemin, dto.edition, superAdmin.id);
  }

  @Get(":id/lien")
  lien(@Param("id", ParseUUIDPipe) id: string) {
    return this.guides.lienVersion(id);
  }
}
