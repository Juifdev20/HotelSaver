import { BadGatewayException, Body, Controller, HttpCode, HttpException, InternalServerErrorException, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { LIMITE_CONNEXION, LIMITE_RAFRAICHISSEMENT } from "../common/throttle/throttle.config";

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
 */
@Controller("auth")
export class AuthProxyController {
  // Le relais appelle Supabase depuis l'IP du serveur : sans limite, un script ferait refuser la connexion à TOUS les employés de TOUS les hôtels.
  @Throttle(LIMITE_CONNEXION)
  @Post("connexion")
  @HttpCode(200)
  connexion(@Body() corps: { email?: string; motDePasse?: string }) {
    return this.relayer("password", { email: corps?.email, password: corps?.motDePasse });
  }

  @Throttle(LIMITE_RAFRAICHISSEMENT)
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
