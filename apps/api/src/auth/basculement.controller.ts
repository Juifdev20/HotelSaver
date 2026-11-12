import { BadRequestException, Body, Controller, HttpCode, Inject, Logger, NotFoundException, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { PrismaClient } from "@hotel-chicago/database";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PRISMA } from "../prisma/prisma.module";
import { SupabaseAdminService } from "../common/supabase-admin/supabase-admin.service";
import { MINUTE } from "../common/throttle/throttle.config";

/**
 * Changement de compte du patron (12/11/2026) : il passe au compte de réception ou de cafétaria de SON hôtel sans se déconnecter ni retaper
 * d'identifiants. Le serveur ouvre une vraie session pour ce compte (voir SupabaseAdminService.creerSessionPour) ; les actions faites ensuite
 * sont celles de ce compte, comme s'il s'était connecté lui-même. Seul le patron, seulement vers un compte actif de son hôtel, jamais vers
 * un autre patron ni vers lui-même. Chaque changement est écrit dans le journal du serveur.
 */
@Controller("auth")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.PATRON)
export class BasculementController {
  private readonly journal = new Logger("Basculement");

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly supabaseAdmin: SupabaseAdminService
  ) {}

  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  @Post("basculer")
  @HttpCode(200)
  async basculer(@Body() corps: { utilisateurId?: string }, @CurrentUser() patron: UtilisateurAuthentifie) {
    const id = typeof corps?.utilisateurId === "string" ? corps.utilisateurId : "";
    if (!id || id === patron.userId) throw new BadRequestException("Choisissez un autre compte.");
    const cible = await this.prisma.utilisateur.findFirst({
      where: { id, hotelId: patron.hotelId },
      select: { id: true, role: true, actif: true, supabaseAuthId: true, nom: true },
    });
    if (!cible) throw new NotFoundException("Ce compte n'existe pas dans votre hôtel.");
    if (!cible.actif) throw new BadRequestException("Ce compte est désactivé : réactivez-le d'abord dans Utilisateurs.");
    if (cible.role === Role.PATRON) throw new BadRequestException("On ne passe pas d'un patron à un autre.");
    const email = await this.supabaseAdmin.lireEmailCompte(cible.supabaseAuthId);
    if (!email) throw new NotFoundException("Compte de connexion introuvable pour cet utilisateur.");
    const session = await this.supabaseAdmin.creerSessionPour(email);
    this.journal.log(`${patron.nom} (${patron.userId}) passe sur le compte ${cible.role} « ${cible.nom} » (${cible.id}), hôtel ${patron.hotelId}`);
    return session;
  }
}
