/**
 * Abonnement dans l'application bureau, pilotée dans un VRAI navigateur (Chromium) : vraie interface, vrai serveur, vraie base Postgres,
 * faux Supabase (authentification) et faux ScanLinkPay (paiement Mobile Money). Prérequis : `pnpm --filter desktop build`
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
import { FauxLinkPay } from "./faux-linkpay";

const SECRET = "secret-de-test-integration";
const p = prisma as any;
const JOUR = 86_400_000;
const RENDERER = join(__dirname, "../../../desktop/out/renderer");
const ACTIF = process.env.TEST_NAVIGATEUR === "1" && existsSync(join(RENDERER, "index.html"));
const MOT_DE_PASSE = "motdepasse-test";

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml" };

(ACTIF ? decrire : describe.skip)("Bureau dans un vrai navigateur : abonnement (blocage, paiement Mobile Money, bandeau)", () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let apiUrl: string;
  let supabase: Server;
  let supabaseUrl: string;
  let statique: Server;
  let siteUrl: string;
  let navigateur: Browser;
  let contexte: BrowserContext;
  let page: Page;
  /** A : essai fini depuis plus de 3 jours (accès coupé). B : idem, pour tester un employé. C : essai qui se termine dans 3 jours. */
  let A: JeuHotel;
  let B: JeuHotel;
  let C: JeuHotel;
  const faux = new FauxLinkPay();
  let jetonsEmis = 0;

  const email = (authId: string) => `${authId}@exemple.test`;
  const menu = () => page.getByRole("complementary", { name: "Navigation principale" });

  beforeAll(async () => {
    verifierBaseJetable();
    await faux.demarrer();
    process.env.LINKPAY_API_URL = faux.url;
    process.env.LINKPAY_NUMERO_MARCHAND = "SLP-TEST01";
    process.env.ABONNEMENT_TAUX_CDF = "2800";
    await viderBase(prisma);
    await p.syncCorrespondance.deleteMany();
    await p.suppression.deleteMany();
    A = await creerHotel(prisma, "A");
    B = await creerHotel(prisma, "B");
    C = await creerHotel(prisma, "C");
    // Essai de 14 jours + 3 jours de grâce : créé il y a 19 jours = accès coupé ; créé il y a 11 jours = il reste 3 jours.
    for (const j of [A, B]) {
      await p.hotel.update({ where: { id: j.hotelId }, data: { createdAt: new Date(Date.now() - 19 * JOUR), statutLicence: "SUSPENDU", suspensionManuelle: false } });
    }
    await p.hotel.update({ where: { id: C.hotelId }, data: { createdAt: new Date(Date.now() - 11 * JOUR), statutLicence: "ACTIF", suspensionManuelle: false } });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICATEUR_JWT)
      .useValue(new VerificateurJwtHs256(SECRET))
      .overrideProvider(SupabaseAdminService)
      .useValue({ supprimerCompte: async () => undefined, mettreAJourCompte: async () => undefined, envoyerRecuperation: async () => undefined, idDepuisJeton: async () => null, motDePasseCorrect: async () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.enableCors();
    await app.listen(0, "127.0.0.1");
    apiUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

    // Faux Supabase Auth : mêmes routes que le vrai (/auth/v1/token), jetons signés avec le secret de test, un compte par rôle et par hôtel.
    const comptes = new Set([A.auth.patron, A.auth.recep, B.auth.patron, B.auth.recep, C.auth.patron, C.auth.recep].map(email));
    supabase = createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      if (req.method === "OPTIONS") return res.writeHead(204).end();
      let corps = "";
      req.on("data", (c) => (corps += c));
      req.on("end", () => {
        const donnees = corps ? JSON.parse(corps) : {};
        const emis = (authId: string) => {
          jetonsEmis += 1;
          return { access_token: jwt.sign({ sub: authId }, SECRET, { expiresIn: 3600 }), refresh_token: `rt-${jetonsEmis}|${authId}`, expires_in: 3600 };
        };
        const reponse = (statut: number, objet: object) => res.writeHead(statut, { "Content-Type": "application/json" }).end(JSON.stringify(objet));
        if (req.url?.includes("grant_type=password")) {
          return comptes.has(donnees.email) && donnees.password === MOT_DE_PASSE ? reponse(200, emis(String(donnees.email).replace("@exemple.test", ""))) : reponse(400, { error_code: "invalid_credentials" });
        }
        if (req.url?.includes("grant_type=refresh_token")) {
          const [, authId] = String(donnees.refresh_token).split("|");
          return authId ? reponse(200, emis(authId)) : reponse(400, { error_code: "refresh_token_not_found" });
        }
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
    contexte = await navigateur.newContext({ viewport: { width: 1400, height: 1000 } });
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
    await faux.arreter();
  });

  async function seConnecter(authId: string) {
    await page.goto(siteUrl);
    await page.getByLabel("Email").fill(email(authId));
    await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: "Se connecter" }).click();
  }

  async function seDeconnecterDeLApplication() {
    await page.getByTestId("utilisateur-connecte").click();
    await page.getByRole("menuitem", { name: /Déconnexion/ }).click();
    await expect_(page.getByLabel("Mot de passe")).toBeVisible();
  }

  it("(a) essai fini depuis plus de 3 jours : le patron voit « Votre abonnement a expiré » à la place de l'application", async () => {
    await seConnecter(A.auth.patron);
    await expect_(page.getByRole("heading", { name: "Votre abonnement a expiré", level: 1 })).toBeVisible(30_000);
    await expect_(page.getByTestId("abonnement-bloque")).toContainText("vos données sont conservées");
    // Pas d'application derrière : ni barre de navigation, ni tableau de bord.
    await expect_(menu()).toHaveCount(0);
    await expect_(page.getByTestId("abonnement-formulaire")).toBeVisible();
    await expect_(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
  });

  it("(b) le patron choisit Pro 1 mois, M-Pesa, paie : attente, puis succès, puis l'application normale revient SANS redémarrer", async () => {
    // Prix lus du serveur : 59 $ pour Pro, 1 mois. Les trois formules sont proposées, « Le plus choisi » sur Pro.
    await expect_(page.getByRole("radio", { name: "Essentiel", exact: true })).toBeVisible();
    await expect_(page.getByRole("radio", { name: "Premium", exact: true })).toBeVisible();
    await expect_(page.getByTestId("abonnement-formulaire")).toContainText("Le plus choisi");

    await page.getByRole("radio", { name: "Pro", exact: true }).check();
    await page.getByRole("radio", { name: /^1 mois/ }).check();
    await page.getByRole("radio", { name: /M-Pesa/ }).check();

    // Numéro mal écrit : message clair, avant tout envoi.
    await page.getByLabel("Numéro de téléphone Mobile Money").fill("12345");
    await page.getByLabel("Numéro de téléphone Mobile Money").blur();
    await expect_(page.getByTestId("abonnement-erreur-numero")).toContainText("Numéro de téléphone invalide");
    await page.getByRole("button", { name: /^Payer/ }).click();
    await expect_(page.getByTestId("abonnement-erreur-numero")).toBeVisible();
    expect(await p.paiementAbonnement.count({ where: { hotelId: A.hotelId } })).toBe(0);

    await page.getByLabel("Numéro de téléphone Mobile Money").fill("0828497218");
    await expect_(page.getByTestId("abonnement-erreur-numero")).toHaveCount(0);
    await expect_(page.getByTestId("abonnement-recap")).toContainText("Vous allez payer 59 $ pour 1 mois de la formule Pro.");
    await page.getByRole("button", { name: "Payer 59 $" }).click();

    await expect_(page.getByRole("heading", { name: /Confirmez le paiement sur votre téléphone/ })).toBeVisible();
    await expect_(page.getByTestId("abonnement-annonce")).toContainText("Confirmez le paiement sur votre téléphone");
    const enBase = await p.paiementAbonnement.findFirst({ where: { hotelId: A.hotelId } });
    expect(enBase).toMatchObject({ statut: "EN_ATTENTE", formule: "PRO", mois: 1 });
    expect(faux.dernier().operateur).toBe("vodacom");

    // Le patron valide sur son téléphone : ScanLinkPay passe à SUCCESS, l'écran le voit au prochain sondage (toutes les 4 s).
    faux.dernier().statut = "SUCCESS";
    await expect_(page.getByTestId("abonnement-succes")).toContainText("Merci ! Abonnement actif jusqu'au", 30_000);
    expect(await p.paiementAbonnement.count({ where: { hotelId: A.hotelId, statut: "REUSSI" } })).toBe(1);

    await page.getByRole("button", { name: "Continuer" }).click();
    // L'application normale réapparaît (sans relancer), synchronisée, sans bandeau (abonnement payé pour 1 mois).
    await expect_(menu()).toBeVisible(30_000);
    await expect_(page.getByTestId("abonnement-bloque")).toHaveCount(0);
    await expect_(page.getByTestId("indicateur-synchro")).toContainText("À jour", 40_000);
    await expect_(page.getByTestId("bandeau-abonnement")).toHaveCount(0);
    expect((await p.hotel.findUnique({ where: { id: A.hotelId } })).statutLicence).toBe("ACTIF");

    // Paramètres → Abonnement : état actif et historique du paiement.
    await page.getByTestId("utilisateur-connecte").click();
    await page.getByRole("menuitem", { name: /Paramètres/ }).click();
    await page.getByTestId("parametres-abonnement").getByRole("button", { name: "Gérer" }).click();
    await expect_(page.getByRole("heading", { name: "Abonnement", level: 1 })).toBeVisible();
    await expect_(page.getByTestId("abonnement-etat")).toContainText("Abonnement actif");
    await expect_(page.getByTestId("abonnement-historique")).toContainText("Payé");
    await expect_(page.getByTestId("abonnement-historique")).toContainText("M-Pesa (Vodacom)");
    await seDeconnecterDeLApplication();
  });

  it("(c) un employé de réception sur un hôtel expiré voit « Demandez au patron » et AUCUN formulaire de paiement", async () => {
    await seConnecter(B.auth.recep);
    await expect_(page.getByRole("heading", { name: "Votre abonnement a expiré", level: 1 })).toBeVisible(30_000);
    await expect_(page.getByTestId("abonnement-patron-seulement")).toContainText("Demandez au patron");
    await expect_(page.getByTestId("abonnement-formulaire")).toHaveCount(0);
    await expect_(page.getByRole("button", { name: /^Payer/ })).toHaveCount(0);
    await expect_(page.getByLabel("Numéro de téléphone Mobile Money")).toHaveCount(0);
    await expect_(menu()).toHaveCount(0);
    expect(await p.paiementAbonnement.count({ where: { hotelId: B.hotelId } })).toBe(0);
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect_(page.getByLabel("Mot de passe")).toBeVisible();
  });

  it("(d) essai qui se termine dans 3 jours : bandeau orange visible et cliquable, qui ouvre l'écran Abonnement", async () => {
    await seConnecter(C.auth.patron);
    await expect_(menu()).toBeVisible(30_000);
    const bandeau = page.getByTestId("bandeau-abonnement");
    await expect_(bandeau).toBeVisible();
    expect(await bandeau.getAttribute("aria-label")).toContain("Essai gratuit : plus que 3 jours");
    expect(await bandeau.getAttribute("class")).toContain("bandeau-abonnement--attention");
    expect(await bandeau.evaluate((e) => e.tagName)).toBe("BUTTON");

    await bandeau.click();
    await expect_(page.getByRole("heading", { name: "Abonnement", level: 1 })).toBeVisible();
    await expect_(page.getByTestId("abonnement-etat")).toContainText("Essai gratuit");
    await expect_(page.getByTestId("abonnement-formulaire")).toContainText("Choisir une formule");
    // Sur la page Abonnement elle-même, le bandeau ne répète pas l'information.
    await expect_(page.getByTestId("bandeau-abonnement")).toHaveCount(0);
    await seDeconnecterDeLApplication();
  });
});

/** `expect` de Playwright n'est pas chargé ici (jest) : petite attente active équivalente, avec message utile. */
function expect_(cible: any, delai = 15_000) {
  const attendre = async (verifier: () => Promise<void>, d = delai) => {
    const fin = Date.now() + d;
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
  return {
    toHaveText: (attendu: string, d = delai) => expect_(cible, d).toContainText(attendu),
    toContainText: (attendu: string, d = delai) =>
      attendre(async () => {
        const t = await cible.first().innerText({ timeout: 1000 });
        if (!t.includes(attendu)) throw new Error(`Texte attendu « ${attendu} », obtenu « ${t} »`);
      }, d),
    toBeVisible: (d = delai) =>
      attendre(async () => {
        if (!(await cible.first().isVisible())) throw new Error("Élément invisible");
      }, d),
    toHaveCount: (n: number, d = delai) =>
      attendre(async () => {
        const c = await cible.count();
        if (c !== n) throw new Error(`Éléments : ${c}, attendu ${n}`);
      }, d),
  };
}
