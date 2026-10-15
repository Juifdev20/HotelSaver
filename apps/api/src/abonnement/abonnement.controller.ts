import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Role } from "@hotel-chicago/types";
import type { UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { SansLicence } from "../common/decorators/sans-licence.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { MINUTE } from "../common/throttle/throttle.config";
import { AbonnementService } from "./abonnement.service";
import { DemandePaiementAbonnementDto } from "./dto/demande-paiement.dto";

/**
 * Abonnement de l'hôtel : état, formules, paiement par Mobile Money. TOUTES ces routes restent ouvertes quand l'abonnement a expiré
 * (@SansLicence) — c'est précisément là que le patron vient payer. Lire l'état est permis à tout le personnel (pour expliquer le blocage) ;
 * payer et consulter l'historique est réservé au PATRON.
 */
@Controller("abonnement")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@SansLicence()
export class AbonnementController {
  constructor(private readonly abonnement: AbonnementService) {}

  @Get()
  vue(@CurrentUser() utilisateur: UtilisateurAuthentifie) {
    return this.abonnement.vue(utilisateur);
  }

  @Post("paiements")
  @Roles(Role.PATRON)
  @Throttle({ default: { limit: 6, ttl: MINUTE } })
  payer(@CurrentUser() utilisateur: UtilisateurAuthentifie, @Body() dto: DemandePaiementAbonnementDto) {
    return this.abonnement.creerPaiement(utilisateur, dto);
  }

  @Get("paiements/:id")
  @Roles(Role.PATRON)
  @Throttle({ default: { limit: 60, ttl: MINUTE } })
  lire(@CurrentUser() utilisateur: UtilisateurAuthentifie, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.abonnement.lirePaiement(utilisateur, id);
  }
}
