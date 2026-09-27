import { ConflictException, Injectable, InternalServerErrorException } from "@nestjs/common";

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
        throw new ConflictException(json.msg || json.message || "Cette adresse email est déjà utilisée.");
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
}
