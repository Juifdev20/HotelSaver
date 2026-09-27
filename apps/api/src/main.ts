import "./charger-env"; // doit rester le premier import (voir le fichier)
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Liste séparée par des virgules : le site public ET le serveur de dev Vite
  // de l'app Electron (http://localhost:5173) doivent pouvoir appeler l'API.
  // Une seule origine ne suffisait pas : en mode dev, la fenêtre Electron est
  // servie par Vite, et Chromium bloquait la réponse (vu par l'app comme
  // « impossible de joindre le serveur »). L'app buildée charge un fichier
  // local et n'est pas concernée.
  const originesAutorisees = process.env.CORS_ORIGIN?.split(",")
    .map((origine) => origine.trim())
    .filter(Boolean);

  app.enableCors({
    origin: originesAutorisees && originesAutorisees.length > 0 ? originesAutorisees : true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`HotelSaver API démarrée sur le port ${port}`);
}

bootstrap();
