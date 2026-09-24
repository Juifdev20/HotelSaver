// Garantit que les modules peuvent s'initialiser pendant les tests même sans
// .env réel : DATABASE_URL/SUPABASE_URL doivent juste être syntaxiquement
// valides — PRISMA et VERIFICATEUR_JWT sont remplacés dans roles.e2e-spec.ts.
process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/placeholder_non_utilise";
process.env.SUPABASE_URL ??= "https://placeholder-non-utilise.supabase.co";
