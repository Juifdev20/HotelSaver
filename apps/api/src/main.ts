import "./charger-env"; // doit rester le premier import (voir le fichier)
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Derrière le proxy de l'hébergeur (Render…), l'adresse du visiteur est dans X-Forwarded-For : sans cela, la limitation de débit
  // verrait TOUT LE MONDE sous l'adresse du proxy. « 1 » = un seul proxy de confiance.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  // En-têtes de sécurité (nosniff, HSTS, pas de cadre…). Une API JSON n'a pas besoin de contenu actif : CSP minimale.
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, crossOriginResourcePolicy: { policy: "cross-origin" } }));

  // Liste séparée par des virgules : le site public ET le serveur de dev Vite
  // de l'app Electron (http://localhost:5173) doivent pouvoir appeler l'API.
  // Une seule origine ne suffisait pas : en mode dev, la fenêtre Electron est
  // servie par Vite, et Chromium bloquait la réponse (vu par l'app comme
  // « impossible de joindre le serveur »). L'app buildée charge un fichier
  // local et n'est pas concernée.
  const originesAutorisees = process.env.CORS_ORIGIN?.split(",")
    .map((origine) => origine.trim())
    .filter(Boolean);

  const enDeveloppement = process.env.NODE_ENV !== "production";

  // Deux régimes (CorsOptionsDelegate, décidé requête par requête) :
  // - `/public/*` : routes anonymes, sans cookie ni jeton, servies au site de
  //   CHAQUE hôtel — sous-domaine `x.hotelsaver.com` ou domaine personnalisé
  //   (Phase 13), en nombre illimité et inconnus de la configuration. Toute
  //   origine y est acceptée : une liste blanche bloquerait chaque nouvel hôtel.
  // - le reste (API authentifiée par jeton Bearer) : liste CORS_ORIGIN, plus
  //   `*.localhost` en développement pour tester un sous-domaine d'hôtel.
  app.enableCors((requete: { url?: string }, callback: (err: Error | null, options: object) => void) => {
    const publique = requete.url?.startsWith("/public/") ?? false;
    if (publique) return callback(null, { origin: true });
    callback(null, {
      origin: (origine: string | undefined, rappel: (err: Error | null, autorise?: boolean) => void) => {
        if (!origine) return rappel(null, true);
        if (!originesAutorisees || originesAutorisees.length === 0) return rappel(null, true);
        if (originesAutorisees.includes(origine)) return rappel(null, true);
        if (enDeveloppement && /^https?:\/\/[a-z0-9-]+\.localhost(:\d+)?$/i.test(origine)) return rappel(null, true);
        rappel(null, false);
      },
    });
  });

  if (!enDeveloppement && (!originesAutorisees || originesAutorisees.length === 0)) {
    // eslint-disable-next-line no-console
    console.warn("CORS_ORIGIN est vide : l'API répond à toutes les origines. Listez-les (voir .env.example) pour un durcissement complet.");
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`HotelSaver API démarrée sur le port ${port}`);
}

bootstrap();
