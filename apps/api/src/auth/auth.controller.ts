import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { PrismaClient } from "@hotel-chicago/database";
import { UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PRISMA } from "../prisma/prisma.module";

/**
 * Toute app cliente (Electron, mobile, futur tableau de bord) s'authentifie
 * directement auprès de Supabase Auth (section 14) puis présente ce jeton à
 * notre API. Cet endpoint est la seule façon pour elle de savoir QUI est
 * connecté et quel rôle métier lui correspond (le rôle vit dans notre table
 * Utilisateur, jamais dans le jeton Supabase lui-même — voir
 * SupabaseAuthGuard). Sans lui, un client ne peut pas savoir quel écran
 * afficher ni quelles actions proposer après connexion.
 */
/** Adresse publique du site d'un hôtel : son domaine personnalisé une fois
 * vérifié, sinon le site HotelSaver avec `?hotel=` (résolu par
 * apps/web/src/resoudreSousDomaine.ts). Base du lien de suivi client. */
export function urlSiteHotel(hotel: { sousDomaine: string; domainePersonnalise: string | null; domaineVerifie: boolean }): string {
  if (hotel.domainePersonnalise && hotel.domaineVerifie) return `https://${hotel.domainePersonnalise}`;
  const site = (process.env.SITE_WEB_URL ?? "http://localhost:5175").replace(/\/+$/, "");
  return `${site}/?hotel=${encodeURIComponent(hotel.sousDomaine)}`;
}

@Controller("auth")
@UseGuards(SupabaseAuthGuard)
export class AuthController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Identité + hôtel de l'utilisateur : les apps affichent le nom (et le slogan défini par
   * le patron) de SON hôtel — jamais un nom codé en dur — pour chaque rôle (patron,
   * réception, cafétaria).
   */
  @Get("me")
  async moi(@CurrentUser() currentUser: UtilisateurAuthentifie) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: currentUser.hotelId },
      select: {
        nom: true,
        adresse: true,
        telephoneContact: true,
        sousDomaine: true,
        domainePersonnalise: true,
        domaineVerifie: true,
        site: { select: { slogan: true } },
      },
    });
    return {
      ...currentUser,
      hotelNom: hotel?.nom ?? "",
      hotelSlogan: hotel?.site?.slogan?.trim() || null,
      hotelAdresse: hotel?.adresse?.trim() || null,
      hotelTelephone: hotel?.telephoneContact?.trim() || null,
      hotelUrlSite: hotel ? urlSiteHotel(hotel) : "",
    };
  }
}
