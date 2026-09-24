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
    ConfigModule.forRoot({ isGlobal: true }),
    HealthModule,
    ChambresModule,
    ReservationsModule,
    ProduitsModule,
    StockModule,
    CafeteriaModule,
  ],
})
export class AppModule {}
