import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { StockService } from "./stock.service";
import { CreateMouvementDto } from "./dto/create-mouvement.dto";
import { FindMouvementsQueryDto } from "./dto/find-mouvements.query.dto";

/**
 * Permissions (section 9.3 "Stock") : RECEPTIONNISTE aucun accès ;
 * CAFETARIA crée des mouvements + lecture ; PATRON lecture + ajustements
 * (via un mouvement de type AJUSTEMENT, pas d'endpoint séparé).
 */
@Controller("stock")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.CAFETARIA, Role.PATRON)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  findAll(@Query() query: FindMouvementsQueryDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.stockService.findAll(query, currentUser.hotelId);
  }

  @Post()
  create(@Body() dto: CreateMouvementDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.stockService.create(dto, currentUser.userId, currentUser.hotelId);
  }
}
