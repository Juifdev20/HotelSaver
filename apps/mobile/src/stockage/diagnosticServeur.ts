import { candidatsApi } from "./configuration";

export interface ResultatTestServeur {
  /** Adresse essayée (sans chemin). */
  adresse: string;
  /** Adresse du téléphone lui-même ou d'un poste de développement : une version publiée ne doit jamais l'utiliser. */
  local: boolean;
  ok: boolean;
  /** Phrase pour l'utilisateur : ce qui s'est passé. */
  detail: string;
}

const DELAI_MS = 20_000;

function estLocale(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?(\/|$)/i.test(url);
}

/**
 * Teste, une par une, les adresses du serveur que cette application sait utiliser (`GET /health`) et dit pourquoi ça répond ou non.
 * Sert à l'écran Synchronisation : « Hors ligne » alors que le téléphone a Internet vient presque toujours d'une adresse de serveur
 * mal embarquée dans l'application, d'un serveur qui se réveille (jusqu'à une minute après une longue inactivité) ou d'un réseau qui le bloque.
 */
export async function testerServeur(): Promise<ResultatTestServeur[]> {
  const adresses = candidatsApi();
  if (adresses.length === 0) {
    return [{ adresse: "(aucune)", local: false, ok: false, detail: "Cette application n'a aucune adresse de serveur valide : elle a été fabriquée sans l'adresse https du serveur. Il faut la reconstruire." }];
  }
  const resultats: ResultatTestServeur[] = [];
  for (const adresse of adresses) {
    const local = estLocale(adresse);
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);
    try {
      const reponse = await fetch(`${adresse}/health`, { signal: controleur.signal });
      if (!reponse.ok) {
        resultats.push({ adresse, local, ok: false, detail: `Le serveur a répondu « erreur ${reponse.status} ». Réessayez dans une minute ; s'il continue, prévenez le support.` });
        continue;
      }
      const corps = (await reponse.json().catch(() => null)) as { service?: string } | null;
      resultats.push(
        corps?.service === "hotel-chicago-api"
          ? { adresse, local, ok: true, detail: "Le serveur répond : la connexion est bonne." }
          : { adresse, local, ok: false, detail: "Cette adresse répond, mais ce n'est pas le serveur HotelSaver (réseau Wi-Fi à page de connexion, ou mauvaise adresse)." }
      );
    } catch (e) {
      const delai = e instanceof Error && e.name === "AbortError";
      resultats.push({
        adresse,
        local,
        ok: false,
        detail: delai
          ? "Pas de réponse après 20 secondes. Le serveur est peut-être en train de se réveiller : réessayez dans une minute."
          : "Impossible de joindre cette adresse (aucune réponse du réseau).",
      });
    } finally {
      clearTimeout(minuteur);
    }
  }
  return resultats;
}
