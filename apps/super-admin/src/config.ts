/** Config par variables d'environnement Vite (VITE_*, voir .env.example) —
 * pas de valeurs par défaut codées en dur comme apps/mobile : cette app est
 * destinée à un vrai déploiement, pas seulement du développement local. */
export const configuration = {
  apiUrl: import.meta.env.VITE_API_URL as string,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
};

if (!configuration.apiUrl || !configuration.supabaseUrl || !configuration.supabaseAnonKey) {
  throw new Error(
    "VITE_API_URL / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants — copier .env.example en .env."
  );
}
