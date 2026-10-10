import { join } from "path";
import { Module, ValidationPipe } from "@nestjs/common";
import { APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { optionsThrottle } from "./common/throttle/throttle.config";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";
import { ChambresModule } from "./chambres/chambres.module";
import { ReservationsModule } from "./reservations/reservations.module";
import { FacturesModule } from "./factures/factures.module";
import { ProduitsModule } from "./produits/produits.module";
import { StockModule } from "./stock/stock.module";
import { CafeteriaModule } from "./cafeteria/cafeteria.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { PublicModule } from "./public/public.module";
import { SyncModule } from "./sync/sync.module";
import { SuperAdminModule } from "./super-admin/super-admin.module";
import { UtilisateursModule } from "./utilisateurs/utilisateurs.module";
import { ClientsModule } from "./clients/clients.module";
import { TauxChangeModule } from "./taux-change/taux-change.module";
import { MediaModule } from "./media/media.module";
import { HotelSiteModule } from "./hotel-site/hotel-site.module";
import { ReglagesHotelModule } from "./reglages-hotel/reglages-hotel.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { RapportsModule } from "./rapports/rapports.module";
import { DepensesModule } from "./depenses/depenses.module";

@Module({
  imports: [
    // envFilePath est résolu par rapport à ce fichier compilé (apps/api/dist/app.module.js
    // → apps/api/.env), pas par rapport au répertoire de travail du process : le dotenv
    // par défaut de @nestjs/config cherche dans process.cwd(), ce qui casse si l'API est
    // lancée depuis la racine du monorepo (le cas courant) plutôt que depuis apps/api.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: join(__dirname, "..", ".env") }),
    // Phase 12 : suspension automatique des hôtels dont la licence a expiré
    // (voir super-admin/licence-scheduler.service.ts).
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot(optionsThrottle),
    HealthModule,
    AuthModule,
    ChambresModule,
    ReservationsModule,
    FacturesModule,
    ProduitsModule,
    StockModule,
    CafeteriaModule,
    DashboardModule,
    PublicModule,
    SyncModule,
    SuperAdminModule,
    UtilisateursModule,
    ClientsModule,
    TauxChangeModule,
    MediaModule,
    HotelSiteModule,
    ReglagesHotelModule,
    NotificationsModule,
    RapportsModule,
    DepensesModule,
  ],
  providers: [
    // Limitation de débit : évaluée avant tout le reste (voir throttle.config.ts).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
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
