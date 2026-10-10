/**
 * L'application bureau pilotée dans un VRAI navigateur (Chromium) : vraie interface, vrai IndexedDB, vrai serveur, vraie base Postgres.
 * Seule l'authentification Supabase est remplacée par un faux serveur local. Prérequis : `pnpm --filter @hotel-chicago/desktop build`
 * (dossier out/renderer) et TEST_NAVIGATEUR=1.
 */
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as jwt from "jsonwebtoken";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { prisma } from "@hotel-chicago/database";
import { AppModule } from "../../src/app.module";
import { VERIFICATEUR_JWT, VerificateurJwtHs256 } from "../../src/common/auth/verificateur-jwt";
import { SupabaseAdminService } from "../../src/common/supabase-admin/supabase-admin.service";
import { decrire, verifierBaseJetable } from "./base";
import { JeuHotel, creerHotel, viderBase } from "./donnees";

const SECRET = "secret-de-test-integration";
const p = prisma as any;
const RENDERER = join(__dirname, "../../../desktop/out/renderer");
const ACTIF = process.env.TEST_NAVIGATEUR === "1" && existsSync(join(RENDERER, "index.html"));
const MOT_DE_PASSE = "motdepasse-test";

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml" };

(ACTIF ? decrire : describe.skip)("Bureau dans un vrai navigateur : travailler sans connexion", () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let apiUrl: string;
  let supabase: Server;
  let supabaseUrl: string;
  let statique: Server;
  let siteUrl: string;
  let navigateur: Browser;
  let contexte: BrowserContext;
  let page: Page;
  let A: JeuHotel;
  let reseauCoupe = false;
  let jetonsEmis = 0;

  beforeAll(async () => {
    verifierBaseJetable();
    await viderBase(prisma);
    await p.syncCorrespondance.deleteMany();
    await p.suppression.deleteMany();
    A = await creerHotel(prisma, "A");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICATEUR_JWT)
      .useValue(new VerificateurJwtHs256(SECRET))
      .overrideProvider(SupabaseAdminService)
      .useValue({ supprimerCompte: async () => undefined, mettreAJourCompte: async () => undefined, envoyerRecuperation: async () => undefined, idDepuisJeton: async () => null })
      .compile();
    app = moduleRef.createNestApplication();
    app.enableCors();
    await app.listen(0, "127.0.0.1");
    apiUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

    // Faux Supabase Auth : mêmes routes que le vrai (/auth/v1/token), jetons signés avec le secret de test.
    supabase = createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      if (req.method === "OPTIONS") return res.writeHead(204).end();
      let corps = "";
      req.on("data", (c) => (corps += c));
      req.on("end", () => {
        const donnees = corps ? JSON.parse(corps) : {};
        const emis = () => {
          jetonsEmis += 1;
          return { access_token: jwt.sign({ sub: A.auth.recep }, SECRET, { expiresIn: 3600 }), refresh_token: `rt-${jetonsEmis}`, expires_in: 3600 };
        };
        const reponse = (statut: number, objet: object) => res.writeHead(statut, { "Content-Type": "application/json" }).end(JSON.stringify(objet));
        if (req.url?.includes("grant_type=password")) {
          return donnees.email === `${A.auth.recep}@exemple.test` && donnees.password === MOT_DE_PASSE ? reponse(200, emis()) : reponse(400, { error_code: "invalid_credentials" });
        }
        if (req.url?.includes("grant_type=refresh_token")) return String(donnees.refresh_token).startsWith("rt-") ? reponse(200, emis()) : reponse(400, { error_code: "refresh_token_not_found" });
        return reponse(404, {});
      });
    });
    await new Promise<void>((ok) => supabase.listen(0, "127.0.0.1", ok));
    supabaseUrl = `http://127.0.0.1:${(supabase.address() as AddressInfo).port}`;

    statique = createServer((req, res) => {
      const chemin = join(RENDERER, decodeURIComponent((req.url ?? "/").split("?")[0]));
      const fichier = existsSync(chemin) && statSync(chemin).isFile() ? chemin : join(RENDERER, "index.html");
      res.writeHead(200, { "Content-Type": TYPES[extname(fichier)] ?? "application/octet-stream" }).end(readFileSync(fichier));
    });
    await new Promise<void>((ok) => statique.listen(0, "127.0.0.1", ok));
    siteUrl = `http://127.0.0.1:${(statique.address() as AddressInfo).port}/`;

    navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
    contexte = await navigateur.newContext({ viewport: { width: 1400, height: 900 } });
    // « Coupure réseau » : seules les adresses du serveur et de l'authentification sont injoignables ; le fichier de l'application reste servi.
    await contexte.route(/127\.0\.0\.1:(\d+)\//, (route) => {
      const port = new URL(route.request().url()).port;
      const serveur = [new URL(apiUrl).port, new URL(supabaseUrl).port].includes(port);
      return serveur && reseauCoupe ? route.abort("internetdisconnected") : route.continue();
    });
    await contexte.addInitScript({
      content: `if (!localStorage.getItem("hotel-chicago:config-navigateur")) localStorage.setItem("hotel-chicago:config-navigateur", ${JSON.stringify(
        JSON.stringify({ apiUrl, supabaseUrl, supabaseAnonKey: "anon", refreshToken: null, imprimanteInterface: null })
      )});`,
    });
    page = await contexte.newPage();
  });

  afterAll(async () => {
    await navigateur?.close();
    await new Promise((ok) => statique?.close(ok));
    await new Promise((ok) => supabase?.close(ok));
    await app?.close();
  });

  const indicateur = () => page.getByTestId("indicateur-synchro");

  it("connexion en ligne, puis l'indicateur dit « À jour » seulement quand tout est synchronisé", async () => {
    await page.goto(siteUrl);
    await page.getByLabel("Email").fill(`${A.auth.recep}@exemple.test`);
    await page.getByLabel("Mot de passe").fill("mauvais");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect_(page.getByTestId("erreur-connexion")).toHaveText("Email ou mot de passe incorrect.");

    await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect_(page.getByTestId("utilisateur-connecte")).toContainText("Réceptionniste");
    await expect_(indicateur()).toContainText("À jour", 20_000);
  });

  it("une modification faite SANS connexion s'affiche aussitôt, l'indicateur dit la vérité, et rien ne part", async () => {
    await page.getByRole("complementary", { name: "Navigation principale" }).getByRole("button", { name: "Chambres" }).click();
    await expect_(page.getByTestId("grille-chambres").or(page.locator("table")).getByText("101").first()).toBeVisible();

    reseauCoupe = true;
    await page.getByRole("button", { name: "Actions pour la chambre 101" }).click();
    await page.getByRole("menuitem", { name: /Nettoyage/ }).click();
    await expect_(indicateur()).toContainText("1 action à envoyer", 20_000);
    await expect_(indicateur()).toContainText("Hors ligne");
    expect((await p.chambre.findFirst({ where: { hotelId: A.hotelId, numero: "101" } })).statut).toBe("LIBRE");
  });

  it("l'application redémarre SANS connexion : session reprise, modification toujours là", async () => {
    await page.reload();
    await expect_(page.getByTestId("bandeau-hors-ligne")).toContainText("sans Internet");
    await expect_(page.getByTestId("utilisateur-connecte")).toContainText("Réceptionniste");
    await page.getByRole("complementary", { name: "Navigation principale" }).getByRole("button", { name: "Chambres" }).click();
    const ligne101 = page.locator("tr", { hasText: "101" }).first();
    await expect_(ligne101).toContainText("Nettoyage");
    await expect_(indicateur()).toContainText("1 action à envoyer");
  });

  it("le réseau revient : l'action part, l'indicateur repasse à « À jour », le serveur a la modification", async () => {
    reseauCoupe = false;
    await page.evaluate("window.dispatchEvent(new Event('online'))");
    await expect_(indicateur()).toContainText("À jour", 40_000);
    await expect_(page.getByTestId("bandeau-hors-ligne")).toHaveCount(0);
    expect((await p.chambre.findFirst({ where: { hotelId: A.hotelId, numero: "101" } })).statut).toBe("NETTOYAGE");
  });

  it("réception sans connexion par l'interface : arrivée express puis facture avec reçu provisoire TEMP-, remplacé par le vrai reçu au retour du réseau", async () => {
    const menu = page.getByRole("complementary", { name: "Navigation principale" });
    reseauCoupe = true;
    await menu.getByRole("button", { name: /Réservations/ }).click();
    await page.getByRole("button", { name: "Nouvelle réservation" }).click();
    const dans20Jours = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    await page.locator("#arrivee").fill(dans20Jours);
    await page.locator("#nuits").fill("2");
    await page.locator('select[aria-label="Chambre"]').selectOption({ label: (await page.locator('select[aria-label="Chambre"] option', { hasText: "102" }).first().innerText()).trim() });
    await page.locator("#nom").fill("Paul Hors-ligne");
    await page.locator("#tel").fill("+243810000777");
    await page.getByLabel(/check-in immédiat/).check();
    await page.getByRole("button", { name: "Créer et enregistrer l'arrivée" }).click();

    // Fiche de la réservation (identifiant LOCAL pour l'instant) : on facture depuis là.
    await expect_(page.getByRole("button", { name: "Facturer et check-out" })).toBeVisible();
    await page.getByRole("button", { name: "Facturer et check-out" }).first().click();
    await page.getByRole("button", { name: "Facturer et check-out" }).last().click();
    await expect_(page.getByRole("heading", { name: "Facture créée" })).toBeVisible();
    const numero = (await page.locator("p.hc-text-label.texte-discret", { hasText: "TEMP-" }).first().innerText()).trim();
    expect(numero).toMatch(/^TEMP-[A-Z0-9]{4}-\d{8}-\d{3}$/);
    await expect_(indicateur()).toContainText("Hors ligne");
    expect(await p.facture.count({ where: { hotelId: A.hotelId, numeroProvisoire: numero } })).toBe(0);

    // Le réseau revient : tout est enregistré par le serveur, le vrai numéro remplace le provisoire.
    reseauCoupe = false;
    await page.evaluate("window.dispatchEvent(new Event('online'))");
    await expect_(indicateur()).toContainText("À jour", 40_000);
    const serveur = await p.facture.findFirst({ where: { hotelId: A.hotelId, numeroProvisoire: numero }, include: { reservation: { include: { client: true, chambre: true } } } });
    expect(serveur.numeroRecu).toMatch(/^REC-\d{8}-\d{4}$/);
    expect(serveur.reservation.client.nom).toBe("Paul Hors-ligne");
    expect(serveur.reservation.statut).toBe("TERMINEE");
    expect((await p.chambre.findUnique({ where: { id: serveur.reservation.chambreId } })).statut).toBe("NETTOYAGE");

    // Dans la base locale du navigateur : le reçu provisoire a été remplacé par le vrai, sans doublon.
    const factures: { numeroRecu: string; numeroProvisoire?: string }[] = await page.evaluate(`new Promise((resolve, reject) => {
      const demande = indexedDB.open("hotelsaver-${A.hotelId}", 1);
      demande.onerror = () => reject(demande.error);
      demande.onsuccess = () => {
        const tout = demande.result.transaction("documents").objectStore("documents").getAll();
        tout.onsuccess = () => resolve(tout.result.filter((d) => d.collection === "Facture").map((d) => d.valeur));
      };
    })`);
    const miennes = factures.filter((f) => f.numeroProvisoire === numero);
    expect(miennes).toHaveLength(1);
    expect(miennes[0].numeroRecu).toBe(serveur.numeroRecu);
    expect(JSON.stringify(factures)).not.toContain(`"numeroRecu":"${numero}"`);
  });

  it("déconnexion puis reconnexion hors ligne avec le mot de passe vérifié sur l'appareil", async () => {
    await page.getByTestId("utilisateur-connecte").click();
    await page.getByRole("menuitem", { name: /Déconnexion/ }).click();
    await expect_(page.getByLabel("Mot de passe")).toBeVisible();
    reseauCoupe = true;
    await page.getByLabel("Email").fill(`${A.auth.recep}@exemple.test`);
    await page.getByLabel("Mot de passe").fill("faux-mot-de-passe");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect_(page.getByTestId("erreur-connexion")).toHaveText("Email ou mot de passe incorrect.");
    await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect_(page.getByTestId("bandeau-hors-ligne")).toBeVisible();
    await page.getByRole("complementary", { name: "Navigation principale" }).getByRole("button", { name: "Chambres" }).click();
    await expect_(page.locator("tr", { hasText: "101" }).first()).toContainText("Nettoyage");
    reseauCoupe = false;
  });
});

/** `expect` de Playwright n'est pas chargé ici (jest) : petite attente active équivalente, avec message utile. */
function expect_(cible: any, delai = 15_000) {
  const attendre = async (verifier: () => Promise<void>) => {
    const fin = Date.now() + delai;
    let derniere: unknown;
    while (Date.now() < fin) {
      try {
        await verifier();
        return;
      } catch (e) {
        derniere = e;
        await new Promise((ok) => setTimeout(ok, 150));
      }
    }
    throw derniere;
  };
  const texteDe = async () => (await cible.allInnerTexts()).join(" ");
  return {
    toHaveText: (attendu: string, d = delai) => expect_(cible, d).toContainText(attendu),
    toContainText: (attendu: string, d = delai) => attendre(async () => { const t = await cible.first().innerText({ timeout: 1000 }); if (!t.includes(attendu)) throw new Error(`Texte attendu « ${attendu} », obtenu « ${t} »`); }),
    toBeVisible: () => attendre(async () => { if (!(await cible.first().isVisible())) throw new Error("Élément invisible"); }),
    toHaveCount: (n: number) => attendre(async () => { const c = await cible.count(); if (c !== n) throw new Error(`Éléments : ${c}, attendu ${n}`); }),
    _texte: texteDe,
  };
}
