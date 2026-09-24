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

/**
 * Messages Supabase (en anglais) → messages français concrets (section 17).
 * On ne réaffiche jamais le texte brut de Supabase au personnel : constaté en
 * test réel, un mauvais mot de passe renvoyait "Invalid login credentials".
 */
const MESSAGES_PAR_CODE: Record<string, string> = {
  invalid_credentials: "Email ou mot de passe incorrect.",
  invalid_grant: "Email ou mot de passe incorrect.",
  email_not_confirmed: "Ce compte n'est pas encore activé. Contactez le patron.",
  user_banned: "Ce compte a été désactivé. Contactez le patron.",
  over_request_rate_limit: "Trop de tentatives. Patientez quelques minutes avant de réessayer.",
  refresh_token_not_found: "Votre session a expiré. Reconnectez-vous.",
  refresh_token_already_used: "Votre session a expiré. Reconnectez-vous.",
};

function messageErreurAuth(status: number, corps: { error_code?: string; error?: string }): string {
  const code = corps.error_code ?? corps.error;
  if (code && MESSAGES_PAR_CODE[code]) {
    return MESSAGES_PAR_CODE[code];
  }
  if (status === 400 || status === 401) {
    return "Email ou mot de passe incorrect.";
  }
  if (status === 429) {
    return MESSAGES_PAR_CODE.over_request_rate_limit;
  }
  return `Le service de connexion a répondu avec une erreur (${status}). Réessayez dans un instant.`;
}

async function envoyer(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    // Internet coupé (fréquent à l'hôtel, section 0) : fetch lève avant toute réponse.
    throw new Error(
      "Impossible de joindre le serveur de connexion. Vérifiez la connexion internet puis réessayez."
    );
  }
}

async function traiterReponseJeton(reponse: Response): Promise<SessionSupabase> {
  const corps = await reponse.json().catch(() => ({}));

  if (!reponse.ok) {
    throw new Error(messageErreurAuth(reponse.status, corps));
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
  const reponse = await envoyer(`${config.url}/auth/v1/token?grant_type=password`, {
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
  const reponse = await envoyer(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.anonKey },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return traiterReponseJeton(reponse);
}
