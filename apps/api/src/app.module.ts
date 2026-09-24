import { join } from "path";
import { Module, ValidationPipe } from "@nestjs/common";
import { APP_PIPE } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./health/health.module";
import { ChambresModule } from "./chambres/chambres.module";
import { ReservationsModule } from "./reservations/reservations.module";
import { FacturesModule } from "./factures/factures.module";
import { ProduitsModule } from "./produits/produits.module";
import { StockModule } from "./stock/stock.module";
import { CafeteriaModule } from "./cafeteria/cafeteria.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { PublicModule } from "./public/public.module";
import { SyncModule } from "./sync/sync.module";

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
    FacturesModule,
    ProduitsModule,
    StockModule,
    CafeteriaModule,
    DashboardModule,
    PublicModule,
    SyncModule,
  ],
  providers: [
    {
      // Enregistré ici (plutôt que via app.useGlobalPipes dans main.ts) pour que
      // les tests Nest (TestingModule.createNestApplication()) bénéficient aussi
      // de la validation — main.ts n'est jamais exécuté pendant les tests.
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}
