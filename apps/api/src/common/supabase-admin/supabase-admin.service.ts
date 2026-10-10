import { ConflictException, HttpException, HttpStatus, Injectable, InternalServerErrorException } from "@nestjs/common";

export interface CompteSupabaseAuth {
  id: string;
  email: string;
}

/**
 * Appelle l'API Admin Supabase Auth (clé service_role) depuis une requête
 * HTTP entrante — reprend exactement le helper `appelAdmin` déjà utilisé par
 * les scripts CLI (`packages/database/scripts/creer-utilisateur.js`,
 * `creer-super-admin.js`), nécessaire ici pour l'inscription en libre-service
 * (Phase 4), qui crée un compte à la volée plutôt qu'en ligne de commande.
 */
@Injectable()
export class SupabaseAdminService {
  private async appel(methode: string, chemin: string, corps?: unknown): Promise<any> {
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.SUPABASE_URL;
    if (!cle || !url) {
      throw new InternalServerErrorException("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY non configurés.");
    }
    const reponse = await fetch(`${url}/auth/v1/admin${chemin}`, {
      method: methode,
      headers: { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: corps ? JSON.stringify(corps) : undefined,
    });
    const json: any = await reponse.json().catch(() => ({}));
    if (!reponse.ok) {
      // 422 côté Supabase Auth Admin recouvre les erreurs corrigibles par
      // l'appelant (ex. "A user with this email address has already been
      // registered") — un cas très courant en inscription libre-service
      // (re-soumission du formulaire), qui doit remonter en 409 propre, pas
      // en 500 générique (constaté en testant un rejeu avec le même email).
      if (reponse.status === 422) {
        // Message fixe : on ne répète pas celui de Supabase (il confirme à un inconnu qu'un compte existe pour cette adresse).
        throw new ConflictException("Impossible de créer un compte avec ces informations. Si vous avez déjà un compte, connectez-vous ou réinitialisez votre mot de passe.");
      }
      throw new InternalServerErrorException(
        `Supabase Auth a refusé (${reponse.status}) : ${json.msg || json.message || JSON.stringify(json)}`
      );
    }
    return json;
  }

  /** `emailConfirme = false` par défaut : contrairement aux comptes créés par
   * un script CLI interne (déjà vérifiés par un humain de confiance), un
   * inscrit en libre-service est un inconnu — Supabase envoie son e-mail de
   * confirmation par défaut. */
  creerCompte(params: { email: string; motDePasse: string; emailConfirme?: boolean }): Promise<CompteSupabaseAuth> {
    return this.appel("POST", "/users", {
      email: params.email,
      password: params.motDePasse,
      email_confirm: params.emailConfirme ?? false,
    });
  }

  /** Jamais laisser un compte Supabase orphelin si l'écriture Prisma qui
   * suit échoue (ex. sousDomaine déjà pris) — même principe que les scripts CLI. */
  async supprimerCompte(id: string): Promise<void> {
    await this.appel("DELETE", `/users/${id}`);
  }

  /** Mise à jour admin du compte Auth : nouvel email et/ou nouveau mot de
   * passe (rotation d'équipe Phase 16 — quand un employé part, le patron
   * change les identifiants du compte de rôle plutôt que d'en créer un
   * autre). `email_confirm: true` pour que le nouvel email soit utilisable
   * tout de suite : changement posé par un admin de confiance, pas un
   * libre-service (même raisonnement que creerCompte ici et
   * PublicService.inscrireHotel). */
  async mettreAJourCompte(id: string, champs: { email?: string; motDePasse?: string }): Promise<void> {
    const corps: Record<string, unknown> = {};
    if (champs.email !== undefined) {
      corps.email = champs.email;
      corps.email_confirm = true;
    }
    if (champs.motDePasse !== undefined) corps.password = champs.motDePasse;
    if (Object.keys(corps).length === 0) return;
    await this.appel("PUT", `/users/${id}`, corps);
  }

  /**
   * Envoie l'e-mail « mot de passe oublié » (Supabase Auth, endpoint public
   * /recover). Supabase répond 200 même si l'adresse n'existe pas (pas
   * d'énumération de comptes) ; seules les limites de débit remontent.
   */
  async envoyerRecuperation(email: string, redirectTo: string): Promise<void> {
    const url = process.env.SUPABASE_URL;
    const cle = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !cle) {
      throw new InternalServerErrorException("SUPABASE_URL/SUPABASE_ANON_KEY non configurés.");
    }
    const reponse = await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      headers: { apikey: cle, "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (reponse.ok) return;
    const json: any = await reponse.json().catch(() => ({}));
    if (reponse.status === 429) {
      throw new HttpException("Trop de demandes. Patientez quelques minutes avant de réessayer.", HttpStatus.TOO_MANY_REQUESTS);
    }
    // Autres échecs (SMTP non configuré, etc.) : journalisés pour l'exploitant,
    // mais jamais révélés au visiteur — même réponse que pour une adresse inconnue.
    // eslint-disable-next-line no-console
    console.error(`[mot de passe oublié] Supabase a refusé (${reponse.status}) : ${json.msg || json.message || JSON.stringify(json)}`);
  }

  /** Identifiant Supabase Auth du détenteur d'un jeton d'accès, ou null si le
   * jeton est invalide ou expiré. */
  async idDepuisJeton(jeton: string): Promise<string | null> {
    const url = process.env.SUPABASE_URL;
    const cle = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !cle) {
      throw new InternalServerErrorException("SUPABASE_URL/SUPABASE_ANON_KEY non configurés.");
    }
    const reponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: cle, Authorization: `Bearer ${jeton}` } });
    if (!reponse.ok) return null;
    const json: any = await reponse.json().catch(() => null);
    return json?.id ?? null;
  }
}
