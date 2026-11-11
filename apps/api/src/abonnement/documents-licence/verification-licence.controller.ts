import { Controller, Get, Header, Param } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { MINUTE } from "../../common/throttle/throttle.config";
import { ContratsLicenceService } from "./contrats-licence.service";

/**
 * Contrôle public d'un contrat de licence (QR code imprimé sur les documents). Aucun guard : n'importe qui peut vérifier un document qu'on lui
 * remet. Il faut le numéro ET le code (début de l'empreinte du contrat) ; la réponse ne donne que de quoi confirmer l'authenticité.
 */
@Controller("public/licences")
export class VerificationLicenceController {
  constructor(private readonly contrats: ContratsLicenceService) {}

  /** Page lisible (celle que le QR code ouvre). */
  @Get("verifier/:numero/:code")
  @Throttle({ default: { limit: 20, ttl: MINUTE } })
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  page(@Param("numero") numero: string, @Param("code") code: string) {
    return this.contrats.pageVerification(numero.slice(0, 40), code.slice(0, 20));
  }

  @Get("verifier/:numero/:code/json")
  @Throttle({ default: { limit: 20, ttl: MINUTE } })
  json(@Param("numero") numero: string, @Param("code") code: string) {
    return this.contrats.verifier(numero.slice(0, 40), code.slice(0, 20));
  }
}
