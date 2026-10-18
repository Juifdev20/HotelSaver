// Lance À LA MAIN le nettoyage des essais abandonnés (même code que la tâche planifiée de 03:30) — pour tester sur le projet Test
// ou rattraper un passage manqué. Usage (dans apps/api) : node --require @swc-node/register scripts/nettoyer-essais.ts
import "../src/charger-env";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { NettoyageEssaisService } from "../src/super-admin/nettoyage-essais.service";

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  const resultat = await app.get(NettoyageEssaisService).executer();
  console.log(JSON.stringify(resultat));
  await app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
