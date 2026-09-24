/**
 * Authentification directe auprès de Supabase Auth (section 14) : les apps
 * clientes (Electron, mobile) ne passent jamais par notre API pour se
 * connecter — seulement pour tout le reste, avec le jeton obtenu ici en
 * en-tête Authorization.
 */

export interface ConfigSupabaseAuth {
  url: string;
  anonKey: string;
}

export interface SessionSupabase {
  accessToken: string;
  refreshToken: string;
  /** Epoch secondes — comparer à Date.now() / 1000 pour savoir s'il faut rafraîchir. */
  expiresAt: number;
}

async function traiterReponseJeton(reponse: Response): Promise<SessionSupabase> {
  const corps = await reponse.json().catch(() => ({}));

  if (!reponse.ok) {
    const message =
      corps.error_description ||
      corps.msg ||
      (reponse.status === 400 ? "Email ou mot de passe incorrect." : `Erreur d'authentification (${reponse.status}).`);
    throw new Error(message);
  }

  return {
    accessToken: corps.access_token,
    refreshToken: corps.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + corps.expires_in,
  };
}

export async function connecterAvecMotDePasse(
  config: ConfigSupabaseAuth,
  email: string,
  motDePasse: string
): Promise<SessionSupabase> {
  const reponse = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.anonKey },
    body: JSON.stringify({ email, password: motDePasse }),
  });
  return traiterReponseJeton(reponse);
}

export async function rafraichirSession(
  config: ConfigSupabaseAuth,
  refreshToken: string
): Promise<SessionSupabase> {
  const reponse = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.anonKey },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return traiterReponseJeton(reponse);
}
