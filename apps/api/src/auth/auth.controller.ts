import { Controller, Get, UseGuards } from "@nestjs/common";
import { UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";

/**
 * Toute app cliente (Electron, mobile, futur tableau de bord) s'authentifie
 * directement auprès de Supabase Auth (section 14) puis présente ce jeton à
 * notre API. Cet endpoint est la seule façon pour elle de savoir QUI est
 * connecté et quel rôle métier lui correspond (le rôle vit dans notre table
 * Utilisateur, jamais dans le jeton Supabase lui-même — voir
 * SupabaseAuthGuard). Sans lui, un client ne peut pas savoir quel écran
 * afficher ni quelles actions proposer après connexion.
 */
@Controller("auth")
@UseGuards(SupabaseAuthGuard)
export class AuthController {
  @Get("me")
  moi(@CurrentUser() currentUser: UtilisateurAuthentifie) {
    return currentUser;
  }
}
