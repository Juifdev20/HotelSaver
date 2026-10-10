import { BadRequestException, Body, Controller, HttpCode, Inject, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { PrismaClient } from "@hotel-chicago/database";
import { UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SupabaseAdminService } from "../common/supabase-admin/supabase-admin.service";
import { revoquerSessions } from "../common/auth/sessions";
import { MINUTE } from "../common/throttle/throttle.config";
import { PRISMA } from "../prisma/prisma.module";
import { ChangerMotDePasseDto } from "./dto-changer-mot-de-passe";

/**
 * « Changer mon mot de passe » : chaque employé peut le faire lui-même (jusqu'ici seul le patron fixait les mots de passe de l'équipe).
 * L'ancien mot de passe est revérifié auprès de Supabase ; les AUTRES sessions du compte sont coupées (la session en cours continue).
 */
@Controller("auth")
@UseGuards(SupabaseAuthGuard)
export class MotDePasseController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly supabaseAdmin: SupabaseAdminService
  ) {}

  @Post("mot-de-passe")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 10 * MINUTE } })
  async changer(@CurrentUser() utilisateur: UtilisateurAuthentifie, @Body() dto: ChangerMotDePasseDto, @Req() requete: { sessionId?: string }) {
    if (dto.nouveauMotDePasse === dto.motDePasseActuel) {
      throw new BadRequestException("Le nouveau mot de passe doit être différent de l'ancien.");
    }
    const compte = await this.prisma.utilisateur.findUnique({ where: { id: utilisateur.userId }, select: { email: true } });
    if (!compte?.email) throw new BadRequestException("Ce compte n'a pas d'adresse e-mail enregistrée : demandez à votre patron de changer votre mot de passe.");
    if (!(await this.supabaseAdmin.motDePasseCorrect(compte.email, dto.motDePasseActuel))) {
      throw new UnauthorizedException("L'ancien mot de passe est incorrect.");
    }
    await this.supabaseAdmin.mettreAJourCompte(utilisateur.supabaseAuthId, { motDePasse: dto.nouveauMotDePasse });
    await revoquerSessions(this.prisma, utilisateur.userId, requete.sessionId);
    return { ok: true };
  }
}
