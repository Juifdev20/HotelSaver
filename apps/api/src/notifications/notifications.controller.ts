import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { NotificationsService } from "./notifications.service";
import { ListerNotificationsQueryDto } from "./dto/lister-notifications.query.dto";
import { EnregistrerAppareilDto, RetirerAppareilDto } from "./dto/appareil.dto";
import { CouperAlerteStockDto } from "./dto/alerte-stock.dto";
import { AlertesStockService } from "./alertes-stock.service";

/**
 * Tout utilisateur connecté (tout rôle) lit les notifications de SON hôtel destinées à SON
 * rôle — le filtrage est dans le service, à partir du jeton, jamais d'un paramètre client.
 */
@Controller("notifications")
@UseGuards(SupabaseAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly alertesStock: AlertesStockService
  ) {}

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

  // ── Alertes de stock : ce que MOI j'ai coupé (jamais ce que coupent les autres) ──
  @Get("alertes-stock/coupures")
  coupures(@CurrentUser() utilisateur: UtilisateurAuthentifie) {
    return this.alertesStock.lister(utilisateur);
  }

  @Post("alertes-stock/coupures")
  @HttpCode(200)
  couper(@Body() dto: CouperAlerteStockDto, @CurrentUser() utilisateur: UtilisateurAuthentifie) {
    return this.alertesStock.couper(utilisateur, dto.produitId ?? null);
  }

  @Delete("alertes-stock/coupures")
  reactiver(@Body() dto: CouperAlerteStockDto, @CurrentUser() utilisateur: UtilisateurAuthentifie) {
    return this.alertesStock.reactiver(utilisateur, dto.produitId ?? null);
  }

  @Post(":id/lue")
  @HttpCode(200)
  async marquerLue(@Param("id") id: string, @CurrentUser() utilisateur: UtilisateurAuthentifie) {
    await this.notificationsService.marquerLue(utilisateur, id);
    return { ok: true };
  }
}