import { config as dotenvConfig } from "dotenv";
import { defineConfig, env } from "prisma/config";

/**
 * Configuration du CLI Prisma (generate, migrate, studio…). Prisma 7 ne lit
 * plus les .env tout seul. Deux projets : .env.test (par défaut) ou .env.prod
 * (--prod / CIBLE=prod). Voir scripts/cible.js pour la même logique côté scripts.
 */
const cible = process.argv.includes("--prod") ? "prod" : (process.env.CIBLE || "test");
dotenvConfig({ path: `.env.${cible}` });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
