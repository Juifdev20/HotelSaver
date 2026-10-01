import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Operationnel } from "../common/decorators/operationnel.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RapportsService } from "./rapports.service";
import { GenererRapportDto } from "./dto/generer-rapport.dto";

/**
 * Rapports mensuels PDF par département (demande du patron 01/10).
 * Génération = opération du département (@Operationnel + filtre
 * département↔rôle dans le service) ; lecture = patron tout, personnel son
 * département — le service refiltre côté données.
 */
@Controller("rapports")
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class RapportsController {
  constructor(private readonly rapports: RapportsService) {}

  @Post()
  @Operationnel()
  @Roles(Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON)
  generer(@Body() dto: GenererRapportDto, @CurrentUser() user: UtilisateurAuthentifie) {
    return this.rapports.generer(user, dto);
  }

  @Get()
  @Roles(Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON)
  lister(
    @CurrentUser() user: UtilisateurAuthentifie,
    @Query("mois") mois?: string,
    @Query("departement") departement?: "CAFETERIA" | "RECEPTION"
  ) {
    return this.rapports.lister(user, mois, departement);
  }

  /** URL signée courte pour ouvrir le PDF (bucket privé, 5 min). */
  @Get(":id/telecharger")
  @Roles(Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON)
  telecharger(@CurrentUser() user: UtilisateurAuthentifie, @Param("id") id: string) {
    return this.rapports.urlTelechargement(user, id);
  }
}
