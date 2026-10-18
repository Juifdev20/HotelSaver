import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { LIBELLE_FONCTION, etatAbonnement, fonctionsAutorisees, type Fonction as CodeFonction } from "@hotel-chicago/regles";
import { FONCTION_KEY } from "../decorators/fonction.decorator";
import { lireCatalogue } from "../abonnement/catalogue";
import { SANS_LICENCE_KEY } from "../decorators/sans-licence.decorator";
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
    @Inject(VERIFICATEUR_JWT) private readonly verificateurJwt: VerificateurJwt,
    @Optional() private readonly reflector?: Reflector
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
      include: { hotel: { include: { paiementsLicence: { where: { annuleLe: null }, orderBy: { periodeCouverteJusquau: "desc" }, take: 1, select: { periodeCouverteJusquau: true } } } } },
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

    // Abonnement : essai, période payée, 3 jours de grâce, puis accès coupé — calculé À CHAQUE requête depuis le dernier paiement (le cron
    // de minuit ne fait que poser le statut SUSPENDU et prévenir). Un hôtel bloqué garde TROIS routes (profil, abonnement, paiement,
    // marquées @SansLicence) : de quoi comprendre pourquoi et renouveler. Tout le reste répond 402, que les applications savent lire.
    const catalogue = await lireCatalogue(this.prisma);
    const etat = etatAbonnement(utilisateur.hotel, utilisateur.hotel.paiementsLicence[0] ?? null, new Date(), catalogue.parametres);
    if (etat.bloque) {
      const exempte = this.reflector?.getAllAndOverride<boolean>(SANS_LICENCE_KEY, [context.getHandler(), context.getClass()]) === true;
      if (!exempte) {
        throw new HttpException(
          {
            statusCode: 402,
            code: "ABONNEMENT_BLOQUE",
            message:
              etat.statut === "EXPIRE"
                ? "L'abonnement de cet hôtel a expiré. Le patron peut le renouveler depuis l'application."
                : "L'accès de cet hôtel est suspendu. Contactez le support HotelSaver.",
          },
          402
        );
      }
    }

    // Fonctions ouvertes par la formule de l'hôtel (ou par l'essai) : une route marquée @Fonction(...) est fermée aux autres.
    const fonctions = fonctionsAutorisees(utilisateur.hotel, utilisateur.hotel.paiementsLicence.length > 0, catalogue.formules, catalogue.parametres);
    const requises = this.reflector?.getAllAndOverride<CodeFonction[]>(FONCTION_KEY, [context.getHandler(), context.getClass()]);
    const manquante = requises?.find((f) => !fonctions.includes(f));
    if (manquante) {
      throw new HttpException(
        {
          statusCode: 403,
          code: "FONCTION_NON_INCLUSE",
          fonction: manquante,
          message: `Cette fonction (${LIBELLE_FONCTION[manquante].split(" : ")[0].toLowerCase()}) n'est pas incluse dans la formule de votre hôtel. Le patron peut passer à une formule supérieure dans Paramètres → Abonnement.`,
        },
        403
      );
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
      fonctions,
    };

    request.user = user;
    request.sessionId = sessionId;
    return true;
  }
}
