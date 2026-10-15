import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { SuperAdminAuthGuard } from "../common/guards/super-admin-auth.guard";
import { AbonnementService } from "./abonnement.service";

/** Suivi des paiements d'abonnement en ligne par l'équipe HotelSaver : voir ce qui est en attente ou échoué, et revérifier un paiement. */
@Controller("super-admin/paiements-abonnement")
@UseGuards(SuperAdminAuthGuard)
export class SupportAbonnementController {
  constructor(private readonly abonnement: AbonnementService) {}

  @Get()
  lister(@Query("limite") limite?: string) {
    return this.abonnement.listerPourSupport(Number(limite) || 100);
  }

  /** Revérifie auprès de ScanLinkPay (même un paiement classé en échec ou expiré) et crédite l'hôtel si le paiement est bien passé. */
  @Post(":id/reverifier")
  reverifier(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.abonnement.reverifierPourSupport(id);
  }
}
