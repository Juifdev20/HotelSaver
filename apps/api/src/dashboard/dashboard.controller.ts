import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { DashboardService } from "./dashboard.service";
import { ParamChainePipe, ParamEntierPipe } from "../common/pipes/param-chaine.pipe";

/**
 * Section 9.3 "Rapports/recettes" : RECEPTIONNISTE et CAFETARIA voient leurs
 * propres opérations (filtré dans le service selon le rôle), PATRON voit
 * tout. `occupation` et `stock-bas` suivent les permissions des modules
 * Chambres et Stock respectivement (pas de notion de "ses opérations" pour
 * des compteurs globaux à l'hôtel).
 */
@Controller("dashboard")
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("recette-du-jour")
  @Roles(Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON)
  recetteDuJour(@CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.dashboardService.recetteDuJour(currentUser);
  }

  /** Recette d'un mois « AAAA-MM » — mêmes agrégats que les rapports PDF. */
  @Get("recette-du-mois")
  @Roles(Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON)
  recetteDuMois(@CurrentUser() currentUser: UtilisateurAuthentifie, @Query("mois", ParamChainePipe) mois: string) {
    return this.dashboardService.recetteDuMois(currentUser, mois);
  }

  /** Journal de la journée pour la remise de poste (heure de Lubumbashi). */
  @Get("journee-reception")
  @Roles(Role.RECEPTIONNISTE, Role.PATRON)
  journeeReception(@CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.dashboardService.journeeReception(currentUser);
  }

  @Get("occupation")
  @Roles(Role.RECEPTIONNISTE, Role.PATRON)
  occupation(@CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.dashboardService.occupation(currentUser.hotelId);
  }

  @Get("ventes-recentes")
  @Roles(Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON)
  ventesRecentes(@CurrentUser() currentUser: UtilisateurAuthentifie, @Query("limite", new ParamEntierPipe(1, 100, 20)) limite: string | number) {
    return this.dashboardService.ventesRecentes(currentUser, limite as number);
  }

  @Get("stock-bas")
  @Roles(Role.CAFETARIA, Role.PATRON)
  stockBas(@CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.dashboardService.stockBas(currentUser.hotelId);
  }
}
