import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { StockService } from "./stock.service";
import { CreateMouvementDto } from "./dto/create-mouvement.dto";
import { FindMouvementsQueryDto } from "./dto/find-mouvements.query.dto";
import { LancerInventaireDto } from "./dto/lancer-inventaire.dto";

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

  // ── Inventaire physique ────────────────────────────────────────────────────

  /**
   * Prépare l'évaluateur d'inventaire : renvoie le stock théorique reconstitué
   * pour chaque produit actif sur la période [debut, fin].
   */
  @Get("inventaire/preparer")
  preparerInventaire(
    @Query("debut") debut: string,
    @Query("fin") fin: string,
    @CurrentUser() currentUser: UtilisateurAuthentifie
  ) {
    return this.stockService.preparerInventaire(debut, fin, currentUser.hotelId);
  }

  /** Enregistre un inventaire physique, génère et stocke le PDF. */
  @Post("inventaires")
  creerInventaire(@Body() dto: LancerInventaireDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.stockService.creerInventaire(dto, currentUser.nom, currentUser.hotelId);
  }

  /** Liste l'historique des inventaires physiques de l'hôtel. */
  @Get("inventaires")
  listerInventaires(@CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.stockService.listerInventaires(currentUser.hotelId);
  }

  /** URL signée (5 min) pour télécharger le PDF d'un inventaire. */
  @Get("inventaires/:id/telecharger")
  telechargerInventaire(@Param("id") id: string, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.stockService.urlPdfInventaire(id, currentUser.hotelId).then((url) => ({ url }));
  }
}
