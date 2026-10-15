import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SuperAdminAuthGuard } from "../common/guards/super-admin-auth.guard";
import { FormulesAdminService } from "./formules-admin.service";
import { ChangerFormuleHotelDto, CreerFormuleDto, ModifierFormuleDto, ModifierParametresDto } from "./dto/formule.dto";

/** Le super-admin (vous) définit les formules, leurs prix, leurs fonctions, et les réglages de la plateforme. Rien de tout cela n'est dans le code. */
@Controller("super-admin")
@UseGuards(SuperAdminAuthGuard)
export class FormulesAdminController {
  constructor(private readonly service: FormulesAdminService) {}

  @Get("formules")
  lister() {
    return this.service.lister();
  }

  @Post("formules")
  creer(@Body() dto: CreerFormuleDto) {
    return this.service.creer(dto);
  }

  @Patch("formules/:code")
  modifier(@Param("code") code: string, @Body() dto: ModifierFormuleDto) {
    return this.service.modifier(code, dto);
  }

  @Delete("formules/:code")
  supprimer(@Param("code") code: string) {
    return this.service.supprimer(code);
  }

  @Get("parametres-abonnement")
  lireParametres() {
    return this.service.lireParametres();
  }

  @Patch("parametres-abonnement")
  modifierParametres(@Body() dto: ModifierParametresDto) {
    return this.service.modifierParametres(dto);
  }

  @Patch("hotels/:id/formule")
  changerFormuleHotel(@Param("id") id: string, @Body() dto: ChangerFormuleHotelDto) {
    return this.service.changerFormuleHotel(id, dto);
  }
}
