/**
 * Lance l'hôte de démonstration du guide (guide-hote.ts) et le garde en vie, pour que les scripts de captures de docs/guide
 * (Playwright, simples fichiers Node) puissent s'y connecter à volonté. Ce n'est pas un test : il s'arrête quand le fichier
 * indiqué par GUIDE_ARRET existe (ou après 3 h).
 *
 *   GUIDE_SERVEUR=1 GUIDE_ARRET=/chemin/arret TEST_INTEGRATION=1 DATABASE_URL=… pnpm --filter @hotel-chicago/api exec jest -c jest.config.js --runInBand --testPathPattern guide-serveur
 * Ports : GUIDE_PORT_BASE (39900 par défaut) + 1 = API, + 2 = authentification, + 3 = application.
 */
import { existsSync } from "node:fs";
import { decrire } from "./base";
import { RENDERER, demarrerHote } from "./guide-hote";

const ACTIF = process.env.GUIDE_SERVEUR === "1" && existsSync(`${RENDERER}/index.html`);

(ACTIF ? decrire : describe.skip)("Hôte de démonstration du guide", () => {
  jest.setTimeout(3 * 3600_000);
  it("reste en vie jusqu'à l'arrêt demandé", async () => {
    const hote = await demarrerHote(Number(process.env.GUIDE_PORT_BASE ?? 39900));
    const arret = process.env.GUIDE_ARRET ?? "/tmp/guide-arret";
    const fin = Date.now() + 3 * 3600_000 - 60_000;
    while (!existsSync(arret) && Date.now() < fin) await new Promise((ok) => setTimeout(ok, 1000));
    await hote.arreter();
  });
});
