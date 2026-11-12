import { BadGatewayException, Body, Controller, HttpCode, HttpException, Inject, InternalServerErrorException, Post } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Throttle } from "@nestjs/throttler";
import { LIMITE_CONNEXION, LIMITE_RAFRAICHISSEMENT } from "../common/throttle/throttle.config";
import { PrismaClient } from "@hotel-chicago/database";
import { normaliserTelephoneRdc } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { emailDuCompte } from "../common/telephone/identifiant-connexion";

/** Même corps que Supabase pour de mauvais identifiants : le client affiche
 * « Numéro ou mot de passe incorrect » sans savoir si le numéro existe. */
/** Durée pendant laquelle la réponse d'un renouvellement est rejouée si le même jeton revient (réponse perdue, double appel). */
const DELAI_REPONSE_RENOUVELLEMENT_MS = 3 * 60_000;

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

  // Le relais appelle Supabase depuis l'IP du serveur : sans limite, un script ferait refuser la connexion à TOUS les employés de TOUS les hôtels.
  @Throttle(LIMITE_CONNEXION)
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

  /** Renouvellements récents, par empreinte du jeton utilisé (voir `rafraichir`). */
  private readonly renouvellementsRecents = new Map<string, { le: number; reponse: Promise<Record<string, unknown>> }>();

  /**
   * Renouvellement de session. Un jeton de renouvellement ne sert QU'UNE fois : si la réponse se perd en route (réseau instable, application
   * fermée juste à ce moment) le téléphone réessaie avec l'ancien jeton, Supabase y voit un vol de session et COUPE la session — l'utilisateur
   * doit retaper son mot de passe. On garde donc quelques minutes la réponse donnée pour un jeton (en mémoire seulement, empreinte comme clé) :
   * le même jeton revient dans ce délai (réessai, deux appareils qui partagent la session, double appel) → même réponse, un seul appel à Supabase.
   * Un renouvellement refusé n'est pas gardé.
   */
  @Throttle(LIMITE_RAFRAICHISSEMENT)
  @Post("rafraichir")
  @HttpCode(200)
  rafraichir(@Body() corps: { refreshToken?: string }) {
    const jeton = corps?.refreshToken;
    if (!jeton) return this.relayer("refresh_token", { refresh_token: jeton });
    const cle = createHash("sha256").update(jeton).digest("hex");
    const maintenant = Date.now();
    for (const [k, v] of this.renouvellementsRecents) if (maintenant - v.le > DELAI_REPONSE_RENOUVELLEMENT_MS) this.renouvellementsRecents.delete(k);
    const connu = this.renouvellementsRecents.get(cle);
    if (connu) return connu.reponse;
    const reponse = this.relayer("refresh_token", { refresh_token: jeton });
    this.renouvellementsRecents.set(cle, { le: maintenant, reponse });
    // Refus ou panne : rien à rejouer, le prochain essai repart de zéro.
    reponse.catch(() => this.renouvellementsRecents.delete(cle));
    if (this.renouvellementsRecents.size > 5000) this.renouvellementsRecents.delete(this.renouvellementsRecents.keys().next().value as string);
    return reponse;
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
