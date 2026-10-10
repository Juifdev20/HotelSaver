import * as jwt from "jsonwebtoken";
import jwksClient, { JwksClient } from "jwks-rsa";

export interface JetonVerifie {
  sub: string;
  /** Identifiant de la session Supabase (`session_id`), absent des jetons de test. */
  sessionId?: string;
}

export interface VerificateurJwt {
  verifier(token: string): Promise<JetonVerifie>;
}

export const VERIFICATEUR_JWT = Symbol("VERIFICATEUR_JWT");

function extraireSub(payload: string | jwt.JwtPayload | undefined): JetonVerifie {
  if (!payload || typeof payload === "string" || typeof payload.sub !== "string") {
    throw new Error("Le jeton ne contient pas de sub valide.");
  }
  return { sub: payload.sub, sessionId: typeof payload.session_id === "string" ? payload.session_id : undefined };
}

/**
 * Production. Ce projet Supabase signe ses jetons en ES256 avec des clés
 * asymétriques publiées sur son endpoint JWKS — PAS avec le secret HS256
 * partagé supposé en Phase 1 (constaté sur un vrai jeton de connexion :
 * en-tête `"alg":"ES256","kid":...`). Seule une clé publique est
 * nécessaire côté serveur ; aucun secret à stocker.
 */
export class VerificateurJwtSupabase implements VerificateurJwt {
  private readonly client: JwksClient;

  constructor(supabaseUrl: string) {
    this.client = jwksClient({
      jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      cache: true,
      rateLimit: true,
    });
  }

  verifier(token: string): Promise<JetonVerifie> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        (header, callback) => {
          this.client.getSigningKey(header.kid, (erreur, cle) => {
            if (erreur || !cle) {
              callback(erreur ?? new Error("Clé de signature introuvable dans le JWKS Supabase."));
              return;
            }
            callback(null, cle.getPublicKey());
          });
        },
        { algorithms: ["ES256", "RS256"] },
        (erreur, payload) => {
          if (erreur) {
            reject(erreur);
            return;
          }
          try {
            resolve(extraireSub(payload));
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }
}

/** Tests uniquement : vérifie des jetons HS256 signés localement avec un
 * secret connu, pour ne pas dépendre d'un endpoint JWKS réseau. */
export class VerificateurJwtHs256 implements VerificateurJwt {
  constructor(private readonly secret: string) {}

  async verifier(token: string): Promise<JetonVerifie> {
    return extraireSub(jwt.verify(token, this.secret, { algorithms: ["HS256"] }));
  }
}
