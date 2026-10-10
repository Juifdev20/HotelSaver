import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from "@nestjs/common";

const URL_VERIFICATION = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * CAPTCHA (Cloudflare Turnstile) sur les routes publiques qui créent des données : inscription d'un hôtel, commande, demande de
 * réservation. Le visiteur envoie `captchaToken` (fourni par le widget du site) dans le corps.
 *
 * Sans `TURNSTILE_SECRET` dans l'environnement, la vérification est SAUTÉE (le site fonctionne avant que les clés soient posées ;
 * un avertissement est écrit au démarrage de la première requête en production). Avec la clé, un jeton absent ou refusé = 403.
 */
@Injectable()
export class CaptchaGuard implements CanActivate {
  private readonly logger = new Logger(CaptchaGuard.name);
  private avertissementEmis = false;

  async canActivate(contexte: ExecutionContext): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === "production" && !this.avertissementEmis) {
        this.avertissementEmis = true;
        this.logger.warn("TURNSTILE_SECRET absent : les routes publiques d'écriture ne sont PAS protégées par un CAPTCHA.");
      }
      return true;
    }
    const requete = contexte.switchToHttp().getRequest<{ body?: { captchaToken?: unknown }; ip?: string }>();
    const jeton = requete.body?.captchaToken;
    if (typeof jeton !== "string" || jeton.length === 0 || jeton.length > 2048) {
      throw new ForbiddenException("Vérification anti-robot manquante : rechargez la page et réessayez.");
    }
    try {
      const corps = new URLSearchParams({ secret, response: jeton });
      if (requete.ip) corps.set("remoteip", requete.ip);
      const reponse = await fetch(URL_VERIFICATION, { method: "POST", body: corps, signal: AbortSignal.timeout(5000) });
      const json = (await reponse.json().catch(() => ({}))) as { success?: boolean };
      if (json.success === true) return true;
    } catch (erreur) {
      this.logger.warn(`Vérification CAPTCHA impossible : ${(erreur as Error).message}`);
      // Service de vérification injoignable : on refuse (fermé par défaut) plutôt que d'ouvrir la route aux robots.
    }
    throw new ForbiddenException("Vérification anti-robot refusée : rechargez la page et réessayez.");
  }
}
