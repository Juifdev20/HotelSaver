import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Configuration du CLI Prisma (generate, migrate, studio…). Prisma 7 ne lit
 * plus les .env tout seul, d'où l'import dotenv en tête : DATABASE_URL vient
 * de packages/database/.env (jamais commité).
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
