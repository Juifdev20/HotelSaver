import type {
  Chambre,
  DemandeReservationPayload,
  HotelCree,
  HotelPartenairePublic,
  InfoHotelPublique,
  InscriptionHotelPayload,
  Produit,
} from "@hotel-chicago/types";
import { ErreurApi } from "./client";

export interface ConfigApiPublique {
  url: string;
}

async function requetePublique<T>(config: ConfigApiPublique, chemin: string, options: RequestInit = {}): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(`${config.url}${chemin}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new ErreurApi(0, "Impossible de joindre le serveur. Vérifiez la connexion internet ou l'URL de l'API.");
  }

  const corps = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    throw new ErreurApi(reponse.status, corps.message || `Erreur ${reponse.status} sur ${chemin}.`);
  }
  return corps;
}

/**
 * Inscription en libre-service (POST /public/hotels/inscription, Phase 4) —
 * fonction autonome comme connecterAvecMotDePasse (supabase-auth.ts), pas
 * une méthode de ClientApi : ces appels se font AVANT toute authentification,
 * ClientApi exige un jeton déjà présent à sa construction.
 */
export function inscrireHotel(config: ConfigApiPublique, dto: InscriptionHotelPayload): Promise<HotelCree> {
  return requetePublique(config, "/public/hotels/inscription", { method: "POST", body: JSON.stringify(dto) });
}

/** GET /public/chambres-disponibles (Phase 9 : sousDomaine obligatoire pour
 * résoudre le bon hôtel, voir DECISIONS.md). */
export function listerChambresDisponibles(
  config: ConfigApiPublique,
  sousDomaine: string,
  dates?: { dateArrivee: string; dateDepart: string }
): Promise<Chambre[]> {
  const params = new URLSearchParams({ sousDomaine, ...(dates ?? {}) }).toString();
  return requetePublique(config, `/public/chambres-disponibles?${params}`);
}

/** GET /public/menu (Phase 9). */
export function listerMenu(config: ConfigApiPublique, sousDomaine: string): Promise<Produit[]> {
  const params = new URLSearchParams({ sousDomaine }).toString();
  return requetePublique(config, `/public/menu?${params}`);
}

/** POST /public/reservations (Phase 9 : sousDomaine ajouté au payload). */
export function creerDemandeReservationPublique(config: ConfigApiPublique, dto: DemandeReservationPayload) {
  return requetePublique(config, "/public/reservations", { method: "POST", body: JSON.stringify(dto) });
}

/** GET /public/hotel (Phase 11) — charte graphique publique de l'hôtel résolu. */
export function obtenirInfoPublique(config: ConfigApiPublique, sousDomaine: string): Promise<InfoHotelPublique> {
  const params = new URLSearchParams({ sousDomaine }).toString();
  return requetePublique(config, `/public/hotel?${params}`);
}

/** GET /public/hotels-partenaires — vitrine de la page d'accueil. */
export function listerHotelsPartenaires(config: ConfigApiPublique): Promise<HotelPartenairePublic[]> {
  return requetePublique(config, "/public/hotels-partenaires");
}

/** POST /public/mot-de-passe-oublie — envoie l'e-mail de récupération. Même
 * réponse que le compte existe ou non (le serveur ne révèle rien). */
export function demanderReinitialisationMotDePasse(config: ConfigApiPublique, email: string): Promise<{ ok: true }> {
  return requetePublique(config, "/public/mot-de-passe-oublie", { method: "POST", body: JSON.stringify({ email }) });
}

/** POST /public/reinitialiser-mot-de-passe — `jeton` = jeton d'accès contenu dans
 * le lien de l'e-mail de récupération (fragment `#access_token=…`). */
export function reinitialiserMotDePasse(config: ConfigApiPublique, jeton: string, motDePasse: string): Promise<{ ok: true }> {
  return requetePublique(config, "/public/reinitialiser-mot-de-passe", {
    method: "POST",
    body: JSON.stringify({ jeton, motDePasse }),
  });
}
