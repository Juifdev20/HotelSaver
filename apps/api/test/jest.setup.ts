// Garantit que PrismaClient peut être instancié pendant les tests même sans
// .env réel : DATABASE_URL doit juste être syntaxiquement valide, la
// connexion réelle n'est jamais utilisée puisque le provider PRISMA est
// remplacé par un mock dans roles.e2e-spec.ts.
process.env.DATABASE_URL ??=
  "postgresql://user:password@localhost:5432/placeholder_non_utilise";
process.env.JWT_SECRET ??= "test-secret-ne-pas-utiliser-en-production";
