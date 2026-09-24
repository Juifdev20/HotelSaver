import { join } from "path";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./health/health.module";
import { ChambresModule } from "./chambres/chambres.module";
import { ReservationsModule } from "./reservations/reservations.module";
import { ProduitsModule } from "./produits/produits.module";
import { StockModule } from "./stock/stock.module";
import { CafeteriaModule } from "./cafeteria/cafeteria.module";

@Module({
  imports: [
    // envFilePath est résolu par rapport à ce fichier compilé (apps/api/dist/app.module.js
    // → apps/api/.env), pas par rapport au répertoire de travail du process : le dotenv
    // par défaut de @nestjs/config cherche dans process.cwd(), ce qui casse si l'API est
    // lancée depuis la racine du monorepo (le cas courant) plutôt que depuis apps/api.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: join(__dirname, "..", ".env") }),
    HealthModule,
    ChambresModule,
    ReservationsModule,
    ProduitsModule,
    StockModule,
    CafeteriaModule,
  ],
})
export class AppModule {}
