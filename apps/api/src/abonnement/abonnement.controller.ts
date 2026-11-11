import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
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
import { ContratsLicenceService } from "./documents-licence/contrats-licence.service";
import { ApercuAbonnementQueryDto, DemandePaiementAbonnementDto } from "./dto/demande-paiement.dto";
import { AccepterContratDto } from "./dto/licence.dto";

/**
 * Abonnement de l'hôtel : état, formules, paiement par Mobile Money. TOUTES ces routes restent ouvertes quand l'abonnement a expiré
 * (@SansLicence) — c'est précisément là que le patron vient payer. Lire l'état est permis à tout le personnel (pour expliquer le blocage) ;
 * payer et consulter l'historique est réservé au PATRON.
 */
@Controller("abonnement")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@SansLicence()
export class AbonnementController {
  constructor(
    private readonly abonnement: AbonnementService,
    private readonly contrats: ContratsLicenceService
  ) {}

  @Get()
  vue(@CurrentUser() utilisateur: UtilisateurAuthentifie) {
    return this.abonnement.vue(utilisateur);
  }

  @Get("apercu")
  @Roles(Role.PATRON)
  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  apercu(@CurrentUser() utilisateur: UtilisateurAuthentifie, @Query() q: ApercuAbonnementQueryDto) {
    return this.abonnement.apercu(utilisateur, q.formule, q.mois, q.devise, q.objet);
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

  /** Contrat de la licence en cours (null sans licence) : le patron le lit puis l'accepte. */
  @Get("contrat")
  @Roles(Role.PATRON)
  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  contrat(@CurrentUser() utilisateur: UtilisateurAuthentifie) {
    return this.contrats.contratPourPatron(utilisateur);
  }

  @Post("contrat/accepter")
  @Roles(Role.PATRON)
  @Throttle({ default: { limit: 6, ttl: MINUTE } })
  accepter(@CurrentUser() utilisateur: UtilisateurAuthentifie, @Body() dto: AccepterContratDto, @Req() req: { ip?: string; headers: Record<string, unknown> }) {
    return this.contrats.accepter(utilisateur, dto.licenceId, dto.empreinte, req.ip ?? null, typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null);
  }
}
