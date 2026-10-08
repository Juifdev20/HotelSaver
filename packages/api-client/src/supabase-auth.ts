import { ErreurApi } from "./client";

/**
 * Authentification : les apps clientes (Electron, mobile) se connectent
 * auprès de Supabase Auth directement OU via le relais de notre API
 * (POST /auth/connexion + /auth/rafraichir — DECISIONS.md « auth proxy »).
 * Le relais est préféré sur mobile : le téléphone n'a besoin que de
 * joindre l'API locale (câble/Wi-Fi), même quand le réseau n'a pas
 * d'Internet (Supabase filtré par le hotspot). Le jeton obtenu sert en
 * en-tête Authorization pour tout le reste.
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
    // Borne l'attente réseau : sans signal, fetch peut pendre jusqu'au
    // timeout TCP (~2 min) sur connexion instable — critique au démarrage.
    return await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
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

// ---------------------------------------------------------------------------
// Variantes via le relais API (POST /auth/connexion, /auth/rafraichir) —
// même shape de retour et mêmes messages français que les appels directs :
// le serveur transmet le corps Supabase tel quel.
// ---------------------------------------------------------------------------

async function envoyerViaApi(urls: string[], chemin: string, corps: Record<string, unknown>): Promise<Response> {
  let reponse: Response | null = null;
  let derniereErreur: ErreurApi | null = null;
  for (const url of urls) {
    try {
      reponse = await fetch(`${url}${chemin}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      // Le relais n'existe pas sur une vieille API (404) : laisser l'appelant
      // choisir le chemin direct Supabase en secours — ne pas tenter l'URL
      // suivante, une autre copie de l'API donnerait le même 404.
      if (reponse.status === 404) throw new ErreurApi(404, "Relais absent.");
      break;
    } catch (e) {
      if (e instanceof ErreurApi) throw e;
      derniereErreur = new ErreurApi(0, "Impossible de joindre le serveur de connexion. Vérifiez la connexion internet puis réessayez.");
    }
  }
  if (!reponse) throw derniereErreur ?? new ErreurApi(0, "Impossible de joindre le serveur de connexion. Vérifiez la connexion internet puis réessayez.");
  return reponse;
}

async function traiterReponseJetonApi(reponse: Response): Promise<SessionSupabase> {
  const corps = await reponse.json().catch(() => ({}));
  if (!reponse.ok) throw new ErreurApi(reponse.status, messageErreurAuth(reponse.status, corps));
  return {
    accessToken: corps.access_token,
    refreshToken: corps.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + corps.expires_in,
  };
}

/** Connexion via POST /auth/connexion du relais (urls = candidatsApi()).
 * ErreurApi 404 = la route n'existe pas (vieille API) → appeler la version
 * Supabase directe en secours. */
export async function connecterViaApi(urls: string[], email: string, motDePasse: string): Promise<SessionSupabase> {
  const reponse = await envoyerViaApi(urls, "/auth/connexion", { email, motDePasse });
  return traiterReponseJetonApi(reponse);
}

/** Renouvellement via POST /auth/rafraichir du relais. */
export async function rafraichirViaApi(urls: string[], refreshToken: string): Promise<SessionSupabase> {
  const reponse = await envoyerViaApi(urls, "/auth/rafraichir", { refreshToken });
  return traiterReponseJetonApi(reponse);
}
