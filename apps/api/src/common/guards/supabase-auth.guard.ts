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
import { SessionRevoqueeError, verifierSession } from "../auth/sessions";

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
    let sessionId: string | undefined;
    try {
      ({ sub, sessionId } = await this.verificateurJwt.verifier(authHeader.slice("Bearer ".length)));
    } catch {
      throw new UnauthorizedException("Jeton d'authentification invalide ou expiré.");
    }

    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { supabaseAuthId: sub },
      include: { hotel: true },
    });

    if (!utilisateur || !utilisateur.actif) {
      throw new UnauthorizedException("Utilisateur inconnu ou désactivé.");
    }

    // Session révoquée (mot de passe changé, compte désactivé…) : refusée même si le jeton n'a pas encore expiré.
    if (sessionId) {
      try {
        await verifierSession(this.prisma, sessionId, utilisateur.id);
      } catch (e) {
        if (e instanceof SessionRevoqueeError) throw new UnauthorizedException("Votre session a pris fin. Reconnectez-vous.");
        throw e;
      }
    }

    // Rend enfin réel le statutLicence posé en Phase 1 (ESSAI/ACTIF/SUSPENDU/
    // RESILIE) : jusqu'ici purement décoratif, PATCH /super-admin/hotels/:id/statut
    // n'avait aucun effet. ESSAI et ACTIF restent équivalents pour l'instant
    // (pas de date d'expiration d'essai — ça reste dans PaiementLicence,
    // hors scope, phase facturation).
    if (utilisateur.hotel.statutLicence === "SUSPENDU" || utilisateur.hotel.statutLicence === "RESILIE") {
      throw new UnauthorizedException("Cet hôtel n'a plus accès à la plateforme (licence suspendue ou résiliée).");
    }

    const user: UtilisateurAuthentifie = {
      userId: utilisateur.id,
      supabaseAuthId: utilisateur.supabaseAuthId,
      role: utilisateur.role as unknown as Role,
      nom: utilisateur.nom,
      hotelId: utilisateur.hotelId,
      patronPeutOperer: utilisateur.hotel.patronPeutOperer,
      cuisineActivee: utilisateur.hotel.cuisineActivee,
      commandeWebActivee: utilisateur.hotel.commandeWebActivee,
    };

    request.user = user;
    request.sessionId = sessionId;
    return true;
  }
}
