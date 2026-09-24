import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { PrismaClient } from "@hotel-chicago/database";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../../prisma/prisma.module";
import { VERIFICATEUR_JWT, VerificateurJwt } from "../auth/verificateur-jwt";

/**
 * Vérifie le jeton Supabase Auth (Bearer) via le VerificateurJwt injecté
 * (JWKS en production, voir verificateur-jwt.ts), puis charge le rôle réel
 * depuis notre table Utilisateur — jamais depuis le jeton lui-même : le rôle
 * métier vit dans Utilisateur.role (section 7).
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
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

    const utilisateur = await this.prisma.utilisateur.findUnique({ where: { supabaseAuthId: sub } });

    if (!utilisateur || !utilisateur.actif) {
      throw new UnauthorizedException("Utilisateur inconnu ou désactivé.");
    }

    const user: UtilisateurAuthentifie = {
      userId: utilisateur.id,
      supabaseAuthId: utilisateur.supabaseAuthId,
      role: utilisateur.role as unknown as Role,
      nom: utilisateur.nom,
    };

    request.user = user;
    return true;
  }
}
