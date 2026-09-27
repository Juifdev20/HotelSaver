import { join } from "path";
import { config } from "dotenv";

/**
 * Charge apps/api/.env AVANT tout autre import de main.ts.
 *
 * Nécessaire depuis Prisma 7 : `@hotel-chicago/database` construit son
 * adaptateur `pg` avec `process.env.DATABASE_URL` au moment où le module est
 * chargé — c'est-à-dire pendant l'évaluation des imports de app.module.ts,
 * donc AVANT que ConfigModule.forRoot() ne lise le .env. Prisma 5 chargeait
 * les .env lui-même ; Prisma 7 ne le fait plus.
 *
 * ConfigModule reste en place pour le reste (isGlobal, ConfigService) ; dotenv
 * n'écrase jamais une variable déjà présente, donc les deux cohabitent.
 * Chemin résolu par rapport au fichier compilé (apps/api/dist/charger-env.js
 * → apps/api/.env), même raison que pour envFilePath dans app.module.ts.
 */
config({ path: join(__dirname, "..", ".env") });
