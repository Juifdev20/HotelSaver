import { ClientApi, connecterAvecMotDePasse, rafraichirSession } from "@hotel-chicago/api-client";
import { GestionnaireSession, type CompteLocal } from "@hotel-chicago/miroir-local";
import type { ConfigurationApp } from "../../../main/config-store";

/** Session du poste : reliée à Supabase pour l'authentification, à l'API pour le profil, et au fichier de configuration du poste
 * (processus principal) pour mémoriser les comptes déjà connectés. */
export function creerGestionnaireSession(config: ConfigurationApp): GestionnaireSession {
  const supabase = { url: config.supabaseUrl, anonKey: config.supabaseAnonKey };
  return new GestionnaireSession({
    authentifier: (email, motDePasse) => connecterAvecMotDePasse(supabase, email, motDePasse),
    rafraichir: (refreshToken) => rafraichirSession(supabase, refreshToken),
    chargerProfil: (accessToken) => new ClientApi(config.apiUrl, () => accessToken).moi(),
    lire: async () => {
      const actuelle = await window.hotelChicago.lireConfiguration();
      return { comptes: (actuelle.comptesLocaux ?? {}) as Record<string, CompteLocal>, compteActif: actuelle.compteActif ?? null };
    },
    ecrire: async (donnees) => {
      await window.hotelChicago.ecrireConfiguration({ comptesLocaux: donnees.comptes, compteActif: donnees.compteActif });
    },
    maintenant: () => new Date(),
  });
}
