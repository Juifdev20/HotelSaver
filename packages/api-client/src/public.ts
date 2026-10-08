import type {
  Chambre,
  CommandeWebCreee,
  CommandeWebPayload,
  DemandeReservationPayload,
  HotelCree,
  HotelPartenairePublic,
  InfoHotelPublique,
  InscriptionHotelPayload,
  PreEnregistrementPayload,
  Produit,
  SuiviReservationPublic,
} from "@hotel-chicago/types";
import { ErreurApi } from "./client";

export interface ConfigApiPublique {
  /** Une URL ou plusieurs candidates (câble USB + Wi-Fi) — même basculement
   * sur erreur réseau que ClientApi. */
  url: string | string[];
}

async function requetePublique<T>(config: ConfigApiPublique, chemin: string, options: RequestInit = {}): Promise<T> {
  const urls = (Array.isArray(config.url) ? config.url : [config.url]).filter(Boolean);
  let reponse: Response | null = null;
  for (const url of urls) {
    try {
      reponse = await fetch(`${url}${chemin}`, {
        ...options,
        headers: { "Content-Type": "application/json", ...options.headers },
      });
      break;
    } catch {
      // Réseau mort sur cette URL — candidate suivante.
    }
  }
  if (!reponse) {
    throw new ErreurApi(0, "Impossible de joindre le serveur. Vérifiez la connexion internet puis réessayez.");
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

/** POST /public/reservations (Phase 9 : sousDomaine ajouté au payload).
 * Réponse réduite au jeton de la page « Ma réservation » (07/10/2026). */
export function creerDemandeReservationPublique(
  config: ConfigApiPublique,
  dto: DemandeReservationPayload
): Promise<{ id: string; statut: string; jetonSuivi: string }> {
  return requetePublique(config, "/public/reservations", { method: "POST", body: JSON.stringify(dto) });
}

function cheminSuivi(jeton: string, sousDomaine: string, suffixe = ""): string {
  return `/public/suivi/${encodeURIComponent(jeton)}${suffixe}?${new URLSearchParams({ sousDomaine })}`;
}

/** GET /public/suivi/:jeton — page « Ma réservation » du client. */
export function obtenirSuiviReservation(config: ConfigApiPublique, sousDomaine: string, jeton: string): Promise<SuiviReservationPublic> {
  return requetePublique(config, cheminSuivi(jeton, sousDomaine));
}

/** POST /public/suivi/:jeton/annuler — le client annule lui-même. */
export function annulerReservationPublique(
  config: ConfigApiPublique,
  sousDomaine: string,
  jeton: string,
  motif?: string
): Promise<SuiviReservationPublic> {
  return requetePublique(config, cheminSuivi(jeton, sousDomaine, "/annuler"), {
    method: "POST",
    body: JSON.stringify(motif ? { motif } : {}),
  });
}

/** POST /public/suivi/:jeton/pre-enregistrement — pièce, heure d'arrivée, demandes. */
export function preEnregistrerReservation(
  config: ConfigApiPublique,
  sousDomaine: string,
  jeton: string,
  donnees: PreEnregistrementPayload
): Promise<SuiviReservationPublic> {
  return requetePublique(config, cheminSuivi(jeton, sousDomaine, "/pre-enregistrement"), {
    method: "POST",
    body: JSON.stringify(donnees),
  });
}

/** POST /public/commande — commande cafétéria depuis la page « Cuisine » du
 * site de l'hôtel (nécessite commandeWebActivee côté hôtel). Les prix sont
 * recalculés côté serveur ; la réponse porte la référence à présenter au
 * comptoir et le total par devise. */
export function creerCommandeWeb(config: ConfigApiPublique, dto: CommandeWebPayload): Promise<CommandeWebCreee> {
  return requetePublique(config, "/public/commande", { method: "POST", body: JSON.stringify(dto) });
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
