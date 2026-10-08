import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { DepensesService } from "./depenses.service";
import { CreerDepenseDto } from "./dto/creer-depense.dto";
import { ModifierDepenseDto } from "./dto/modifier-depense.dto";
import { FiltresDepensesQueryDto } from "./dto/filtres-depenses.query.dto";

/**
 * Dépenses par département. Écriture : le personnel seulement (pas
 * @Operationnel : le patron n'écrit jamais ici, même s'il « peut opérer ») ;
 * lecture et PDF : les trois rôles, refiltrés par département dans le service.
 */
@Controller("depenses")
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class DepensesController {
  constructor(private readonly depenses: DepensesService) {}

  @Post()
  @Roles(Role.RECEPTIONNISTE, Role.CAFETARIA)
  creer(@Body() dto: CreerDepenseDto, @CurrentUser() user: UtilisateurAuthentifie) {
    return this.depenses.creer(dto, user);
  }

  @Get()
  @Roles(Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON)
  lister(@Query() filtres: FiltresDepensesQueryDto, @CurrentUser() user: UtilisateurAuthentifie) {
    return this.depenses.lister(user, filtres);
  }

  /** URL signée courte du PDF de la période (bucket privé, 5 min). */
  @Get("pdf")
  @Roles(Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON)
  pdf(@Query() filtres: FiltresDepensesQueryDto, @CurrentUser() user: UtilisateurAuthentifie) {
    return this.depenses.urlPdf(user, filtres);
  }

  @Patch(":id")
  @Roles(Role.RECEPTIONNISTE, Role.CAFETARIA)
  modifier(@Param("id") id: string, @Body() dto: ModifierDepenseDto, @CurrentUser() user: UtilisateurAuthentifie) {
    return this.depenses.modifier(id, dto, user);
  }
}
