import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { PrismaClient } from "@hotel-chicago/database";
import { SuperAdminAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../../prisma/prisma.module";
import { VERIFICATEUR_JWT, VerificateurJwt } from "../auth/verificateur-jwt";

/**
 * Copie conforme de SupabaseAuthGuard, mais contre la table SuperAdmin
 * plutôt qu'Utilisateur — un super-admin est indépendant de tout hôtel (voir
 * DECISIONS.md, Phase 3). Même VerificateurJwt injecté : le JWKS Supabase
 * qui signe le jeton est le même peu importe qui se connecte, seule la
 * table consultée pour retrouver l'identité change.
 */
@Injectable()
export class SuperAdminAuthGuard implements CanActivate {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(VERIFICATEUR_JWT) private readonly verificateurJwt: VerificateurJwt
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Jeton d'authentification manquant.");
    }

    let sub: string;
    try {
      ({ sub } = await this.verificateurJwt.verifier(authHeader.slice("Bearer ".length)));
    } catch {
      throw new UnauthorizedException("Jeton d'authentification invalide ou expiré.");
    }

    const superAdmin = await this.prisma.superAdmin.findUnique({ where: { supabaseAuthId: sub } });

    if (!superAdmin || !superAdmin.actif) {
      throw new UnauthorizedException("Super-admin inconnu ou désactivé.");
    }

    const user: SuperAdminAuthentifie = {
      id: superAdmin.id,
      supabaseAuthId: superAdmin.supabaseAuthId,
      nom: superAdmin.nom,
    };

    request.user = user;
    return true;
  }
}
