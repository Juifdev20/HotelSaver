import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";
import type { UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Fonction } from "../common/decorators/fonction.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ReglagesPaiementService } from "./reglages-paiement.service";
import { RemboursementsService } from "./remboursements.service";
import { PaiementReservationService } from "./paiement-reservation.service";
import { ModifierReglagesPaiementDto, TraiterRemboursementDto } from "./dto/reglages-paiement.dto";

/** Le compte ScanLinkPay de l'hôtel et la règle d'acompte. PATRON seul (c'est son argent). La lecture reste possible sans la fonction pour afficher « non inclus ». */
@Controller("hotel/paiement-en-ligne")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.PATRON)
export class PaiementEnLigneController {
  constructor(private readonly reglages: ReglagesPaiementService) {}

  @Get()
  lire(@CurrentUser() u: UtilisateurAuthentifie) {
    return this.reglages.lire(u.hotelId);
  }

  @Patch()
  modifier(@CurrentUser() u: UtilisateurAuthentifie, @Body() dto: ModifierReglagesPaiementDto) {
    return this.reglages.modifier(u.hotelId, dto);
  }
}

/** Les acomptes à rendre ou à garder. Réservé au PATRON : c'est lui qui décide, et qui envoie l'argent. */
@Controller("remboursements")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.PATRON)
@Fonction("RECEPTION")
export class RemboursementsController {
  constructor(private readonly remboursements: RemboursementsService) {}

  @Get()
  lister(@CurrentUser() u: UtilisateurAuthentifie, @Query("statut") statut?: string) {
    return this.remboursements.lister(u.hotelId, statut);
  }

  /** Pour le badge « n à faire » des applications. */
  @Get("a-faire")
  async aFaire(@CurrentUser() u: UtilisateurAuthentifie) {
    return { nombre: await this.remboursements.compterAFaire(u.hotelId) };
  }

  @Patch(":id")
  traiter(@CurrentUser() u: UtilisateurAuthentifie, @Param("id") id: string, @Body() dto: TraiterRemboursementDto) {
    return this.remboursements.traiter(u.hotelId, id, dto, u);
  }
}

/** « Payé en ligne » : pour que la réception ET le patron voient d'un coup d'œil quelles réservations ont déjà leur acompte payé, et comment. */
@Controller("acomptes-en-ligne")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.PATRON, Role.RECEPTIONNISTE)
@Fonction("RECEPTION")
export class AcomptesEnLigneController {
  constructor(private readonly paiements: PaiementReservationService) {}

  @Get()
  lister(@CurrentUser() u: UtilisateurAuthentifie) {
    return this.paiements.acomptesPayesEnLigne(u.hotelId);
  }
}
