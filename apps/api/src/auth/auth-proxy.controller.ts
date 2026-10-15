import { BadGatewayException, Body, Controller, HttpCode, HttpException, Inject, InternalServerErrorException, Post } from "@nestjs/common";
import { PrismaClient } from "@hotel-chicago/database";
import { normaliserTelephoneRdc } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { emailDuCompte } from "../common/telephone/identifiant-connexion";

/** Même corps que Supabase pour de mauvais identifiants : le client affiche
 * « Numéro ou mot de passe incorrect » sans savoir si le numéro existe. */
const IDENTIFIANTS_INCORRECTS = { error_code: "invalid_credentials", msg: "Invalid login credentials" };

/**
 * Relais d'authentification vers Supabase Auth — le client parle à NOTRE
 * API, c'est elle qui appelle Supabase (DECISIONS.md, 06/10/2026 « auth
 * proxy »). Utile en développement où le téléphone n'a qu'un accès local
 * (hotspot sans Internet : le serveur, lui, voit Supabase), mais aussi en
 * production — l'app préfère le relais, direct Supabase en secours.
 *
 * Routes PUBLIQUES (pas de SupabaseAuthGuard — le jeton est justement ce
 * qu'on cherche à obtenir). Pas de log des identifiants ; statut et corps
 * transmis tels quels : le mapping des erreurs en français reste le
 * travail du client (supabase-auth.ts, MESSAGES_PAR_CODE).
 *
 * Connexion par numéro (15/10/2026) : `telephone` (ou `identifiant` sans
 * « @ ») est normalisé puis recherché dans Utilisateur / SuperAdmin ; on
 * relaie avec l'e-mail du compte Supabase (e-mail réel ou identifiant
 * interne, voir identifiant-connexion.ts). Un identifiant contenant « @ » est
 * un e-mail, transmis tel quel (comptes antérieurs, transition).
 */
@Controller("auth")
export class AuthProxyController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Post("connexion")
  @HttpCode(200)
  async connexion(@Body() corps: { telephone?: string; email?: string; identifiant?: string; motDePasse?: string }) {
    const saisie = (corps?.telephone ?? corps?.identifiant ?? corps?.email ?? "").trim();
    const email = saisie.includes("@") ? saisie : await this.emailDepuisTelephone(saisie);
    return this.relayer("password", { email, password: corps?.motDePasse });
  }

  private async emailDepuisTelephone(saisie: string): Promise<string> {
    const telephone = normaliserTelephoneRdc(saisie);
    if (!telephone) throw new HttpException(IDENTIFIANTS_INCORRECTS, 400);
    const utilisateur = await this.prisma.utilisateur.findUnique({ where: { telephone }, select: { email: true } });
    if (utilisateur) return emailDuCompte(telephone, utilisateur.email);
    const superAdmin = await this.prisma.superAdmin.findUnique({ where: { telephone }, select: { email: true } });
    if (superAdmin) return emailDuCompte(telephone, superAdmin.email);
    throw new HttpException(IDENTIFIANTS_INCORRECTS, 400);
  }

  @Post("rafraichir")
  @HttpCode(200)
  rafraichir(@Body() corps: { refreshToken?: string }) {
    return this.relayer("refresh_token", { refresh_token: corps?.refreshToken });
  }

  private async relayer(grantType: string, corps: Record<string, unknown>) {
    const url = process.env.SUPABASE_URL;
    const cle = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !cle) {
      throw new InternalServerErrorException("SUPABASE_URL/SUPABASE_ANON_KEY non configurés.");
    }
    let amont: Response;
    try {
      amont = await fetch(`${url}/auth/v1/token?grant_type=${grantType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cle },
        body: JSON.stringify(corps),
      });
    } catch {
      // Supabase injoignable depuis l'API : le client tombera sur son
      // chemin direct (Supabase) s'il existe, sinon erreur réseau.
      throw new BadGatewayException("Le service de connexion est injoignable depuis le serveur.");
    }
    const corpsAmont = (await amont.json().catch(() => ({}))) as Record<string, unknown>;
    if (!amont.ok) {
      throw new HttpException(corpsAmont, amont.status);
    }
    return corpsAmont;
  }
}
