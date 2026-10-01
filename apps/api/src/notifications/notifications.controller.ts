import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { NotificationsService } from "./notifications.service";
import { ListerNotificationsQueryDto } from "./dto/lister-notifications.query.dto";
import { EnregistrerAppareilDto, RetirerAppareilDto } from "./dto/appareil.dto";

/**
 * Tout utilisateur connecté (tout rôle) lit les notifications de SON hôtel destinées à SON
 * rôle — le filtrage est dans le service, à partir du jeton, jamais d'un paramètre client.
 */
@Controller("notifications")
@UseGuards(SupabaseAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  lister(@Query() query: ListerNotificationsQueryDto, @CurrentUser() utilisateur: UtilisateurAuthentifie) {
    return this.notificationsService.lister(utilisateur, query);
  }

  // Routes littérales AVANT ":id" : sinon "lues" et "appareils" seraient pris pour un identifiant.
  @Post("lues")
  @HttpCode(200)
  async marquerToutesLues(@CurrentUser() utilisateur: UtilisateurAuthentifie) {
    await this.notificationsService.marquerToutesLues(utilisateur);
    return { ok: true };
  }

  @Post("appareils")
  @HttpCode(200)
  async enregistrerAppareil(@Body() dto: EnregistrerAppareilDto, @CurrentUser() utilisateur: UtilisateurAuthentifie) {
    await this.notificationsService.enregistrerAppareil(utilisateur, dto.jeton, dto.plateforme);
    return { ok: true };
  }

  @Delete("appareils")
  async retirerAppareil(@Body() dto: RetirerAppareilDto, @CurrentUser() utilisateur: UtilisateurAuthentifie) {
    await this.notificationsService.retirerAppareil(utilisateur, dto.jeton);
    return { ok: true };
  }

  @Post(":id/lue")
  @HttpCode(200)
  async marquerLue(@Param("id") id: string, @CurrentUser() utilisateur: UtilisateurAuthentifie) {
    await this.notificationsService.marquerLue(utilisateur, id);
    return { ok: true };
  }
}