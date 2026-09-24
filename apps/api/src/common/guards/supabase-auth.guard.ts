import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import type { PrismaClient } from "@hotel-chicago/database";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../../prisma/prisma.module";

interface SupabaseJwtPayload {
  sub: string;
  [key: string]: unknown;
}

/**
 * Vérifie le jeton Supabase Auth (Bearer, signé HS256 avec JWT_SECRET) puis
 * charge le rôle réel depuis notre table Utilisateur (jamais depuis le
 * jeton lui-même : le rôle métier vit dans Utilisateur.role, section 7).
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Jeton d'authentification manquant.");
    }

    const token = authHeader.slice("Bearer ".length);
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new UnauthorizedException(
        "JWT_SECRET n'est pas configuré côté serveur : impossible de vérifier le jeton."
      );
    }

    let payload: SupabaseJwtPayload;
    try {
      payload = jwt.verify(token, secret) as SupabaseJwtPayload;
    } catch {
      throw new UnauthorizedException("Jeton d'authentification invalide ou expiré.");
    }

    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { supabaseAuthId: payload.sub },
    });

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
