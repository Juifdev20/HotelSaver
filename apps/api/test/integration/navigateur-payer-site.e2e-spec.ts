/**
 * Site web dans un VRAI navigateur (Chromium) : « Payer mon abonnement » (/payer) et le choix « essai gratuit / payer maintenant » à l'inscription.
 * Vrai serveur, vraie base Postgres, faux Supabase (connexion) et faux ScanLinkPay (Mobile Money). Prérequis : le site construit POUR CE TEST avec l'API
 * sur le port fixe 39811 (`VITE_API_URL=http://127.0.0.1:39811 pnpm --filter web exec vite build --outDir dist-test`) et TEST_NAVIGATEUR=1.
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
import { JeuHotel, creerHotel, uuid, viderBase } from "./donnees";
import { FauxLinkPay } from "./faux-linkpay";

const SECRET = "secret-de-test-integration";
const p = prisma as any;
const JOUR = 86_400_000;
const SITE = join(__dirname, "../../../web/dist-test");
const PORT_API = 39811;
const ACTIF = process.env.TEST_NAVIGATEUR === "1" && existsSync(join(SITE, "index.html"));
const MOT_DE_PASSE = "motdepasse-test";

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml" };

(ACTIF ? decrire : describe.skip)("Site web dans un vrai navigateur : payer son abonnement (essai conservé, accès rouvert) et choisir « payer maintenant » à l'inscription", () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let supabase: Server;
  let statique: Server;
  let siteUrl: string;
  let navigateur: Browser;
  let contexte: BrowserContext;
  let page: Page;
  /** A : essai fini depuis plus de 3 jours (accès coupé). C : essai qui se termine dans 3 jours. */
  let A: JeuHotel;
  let C: JeuHotel;
  const faux = new FauxLinkPay();
  let jetonsEmis = 0;
  const email = (authId: string) => `${authId}@exemple.test`;

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
    C = await creerHotel(prisma, "C");
    await p.hotel.update({ where: { id: A.hotelId }, data: { createdAt: new Date(Date.now() - 19 * JOUR), statutLicence: "SUSPENDU", suspensionManuelle: false } });
    await p.hotel.update({ where: { id: C.hotelId }, data: { createdAt: new Date(Date.now() - 11 * JOUR), statutLicence: "ACTIF", suspensionManuelle: false } });

    const comptes = new Set([A.auth.patron, A.auth.recep, C.auth.patron].map(email));
    supabase = createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      if (req.method === "OPTIONS") return res.writeHead(204).end();
      let corps = "";
      req.on("data", (c) => (corps += c));
      req.on("end", () => {
        const donnees = corps ? JSON.parse(corps) : {};
        const reponse = (statut: number, objet: object) => res.writeHead(statut, { "Content-Type": "application/json" }).end(JSON.stringify(objet));
        if (req.url?.includes("grant_type=password")) {
          if (!comptes.has(donnees.email) || donnees.password !== MOT_DE_PASSE) return reponse(400, { error_code: "invalid_credentials" });
          jetonsEmis += 1;
          const authId = String(donnees.email).replace("@exemple.test", "");
          return reponse(200, { access_token: jwt.sign({ sub: authId }, SECRET, { expiresIn: 3600 }), refresh_token: `rt-${jetonsEmis}|${authId}`, expires_in: 3600 });
        }
        return reponse(404, {});
      });
    });
    await new Promise<void>((ok) => supabase.listen(0, "127.0.0.1", ok));
    process.env.SUPABASE_URL = `http://127.0.0.1:${(supabase.address() as AddressInfo).port}`;
    process.env.SUPABASE_ANON_KEY = "anon";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICATEUR_JWT)
      .useValue(new VerificateurJwtHs256(SECRET))
      .overrideProvider(SupabaseAdminService)
      .useValue({ creerCompte: async (c: { email: string }) => ({ id: uuid(), email: c.email }), supprimerCompte: async () => undefined, mettreAJourCompte: async () => undefined, envoyerRecuperation: async () => undefined, idDepuisJeton: async () => null, motDePasseCorrect: async () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.enableCors();
    await app.listen(PORT_API, "127.0.0.1");

    statique = createServer((req, res) => {
      const chemin = join(SITE, decodeURIComponent((req.url ?? "/").split("?")[0]));
      const fichier = existsSync(chemin) && statSync(chemin).isFile() ? chemin : join(SITE, "index.html");
      res.writeHead(200, { "Content-Type": TYPES[extname(fichier)] ?? "application/octet-stream" }).end(readFileSync(fichier));
    });
    await new Promise<void>((ok) => statique.listen(0, "127.0.0.1", ok));
    siteUrl = `http://127.0.0.1:${(statique.address() as AddressInfo).port}`;

    navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
    contexte = await navigateur.newContext({ viewport: { width: 1200, height: 1000 } });
    page = await contexte.newPage();
  });

  afterAll(async () => {
    await navigateur?.close();
    await new Promise((ok) => statique?.close(ok));
    await new Promise((ok) => supabase?.close(ok));
    await app?.close();
    await faux.arreter();
  });

  async function seConnecter(authId: string, mdp = MOT_DE_PASSE) {
    await page.goto(`${siteUrl}/payer?email=${encodeURIComponent(email(authId))}`);
    expect(await page.getByLabel("Adresse e-mail").inputValue()).toBe(email(authId));
    await page.getByLabel("Mot de passe", { exact: true }).fill(mdp);
    await page.getByRole("button", { name: "Continuer" }).click();
  }

  it("(a) mauvais mot de passe : message clair ; un employé est refusé (seul le patron paie)", async () => {
    await seConnecter(A.auth.patron, "mauvais-mot-de-passe");
    await expect_(page.getByRole("alert")).toBeVisible();
    await page.goto(`${siteUrl}/payer?email=${encodeURIComponent(email(A.auth.recep))}`);
    await page.getByLabel("Mot de passe", { exact: true }).fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect_(page.getByRole("alert")).toContainText("Seul le patron");
  });

  it("(b) pendant l'essai : le patron paie Pro 1 mois sur le site ; les jours d'essai restants sont CONSERVÉS", async () => {
    await seConnecter(C.auth.patron);
    await expect_(page.getByRole("heading", { name: /Abonnement de/ })).toBeVisible(30_000);
    await expect_(page.getByText(/Essai gratuit/).first()).toBeVisible();
    await expect_(page.getByText("Aucun jour d'essai n'est perdu")).toBeVisible();
    await page.getByRole("radio", { name: /^Pro/ }).check();
    await page.getByRole("radio", { name: /^1 mois/ }).check();
    await page.getByRole("radio", { name: /M-Pesa/ }).check();
    await page.getByLabel("Votre numéro Mobile Money").fill("12345");
    await page.getByLabel("Votre numéro Mobile Money").blur();
    await expect_(page.getByRole("alert")).toContainText("invalide");
    expect(await p.paiementAbonnement.count({ where: { hotelId: C.hotelId } })).toBe(0);
    await page.getByLabel("Votre numéro Mobile Money").fill("0828497218");
    // Frais ScanLinkPay annoncés avant de payer : 59 $ + 1,18 $ = 60,18 $.
    await expect_(page.getByRole("button", { name: "Payer 60,18 $" })).toBeVisible();
    await expect_(page.locator(".payer__total")).toContainText("frais ScanLinkPay 1,18 $");
    await page.getByRole("button", { name: "Payer 60,18 $" }).click();
    await expect_(page.getByRole("heading", { name: /Confirmez le paiement sur votre téléphone/ })).toBeVisible();
    expect(await p.paiementAbonnement.findFirst({ where: { hotelId: C.hotelId } })).toMatchObject({ statut: "EN_ATTENTE", formule: "PRO", mois: 1 });
    faux.dernier().statut = "SUCCESS";
    await expect_(page.getByRole("heading", { name: /votre abonnement est payé/ })).toBeVisible(30_000);
    const lic = await p.paiementLicence.findFirst({ where: { hotelId: C.hotelId }, orderBy: { createdAt: "desc" } });
    // Essai : 3 jours restants + 1 mois payé = plus de 31 jours (aucun jour perdu).
    expect(lic.periodeCouverteJusquau.getTime()).toBeGreaterThan(Date.now() + 31 * JOUR);
    expect((await p.hotel.findUnique({ where: { id: C.hotelId } })).formule).toBe("PRO");
  });

  it("(c) accès coupé (essai fini) : le patron paie depuis le site et l'hôtel est rouvert", async () => {
    await seConnecter(A.auth.patron);
    await expect_(page.getByText("Abonnement expiré").first()).toBeVisible(30_000);
    await page.getByRole("radio", { name: /^Essentiel/ }).check();
    await page.getByRole("radio", { name: /^1 mois/ }).check();
    await page.getByRole("radio", { name: /Airtel/ }).check();
    await page.getByLabel("Votre numéro Mobile Money").fill("0998765432");
    await page.getByRole("button", { name: /^Payer/ }).click();
    await expect_(page.getByRole("heading", { name: /Confirmez le paiement sur votre téléphone/ })).toBeVisible();
    faux.dernier().statut = "SUCCESS";
    await expect_(page.getByRole("heading", { name: /votre abonnement est payé/ })).toBeVisible(30_000);
    expect((await p.hotel.findUnique({ where: { id: A.hotelId } })).statutLicence).toBe("ACTIF");
    expect(await p.paiementAbonnement.count({ where: { hotelId: A.hotelId, statut: "REUSSI" } })).toBe(1);
  });

  it("(d) inscription : « Payer mon abonnement maintenant » mène vers la page de paiement (essai gratuit : pas de lien)", async () => {
    for (const [choix, sousDomaine, attendLien] of [["Payer mon abonnement maintenant", "hotel-paye", true], ["Essai gratuit", "hotel-essai", false]] as const) {
      await page.goto(`${siteUrl}/inscription`);
      await page.getByLabel("Nom de l'hôtel *").fill(`Hôtel ${sousDomaine}`);
      await page.getByLabel("Sous-domaine *").fill(sousDomaine);
      await page.getByRole("button", { name: /Continuer/ }).click();
      await page.getByLabel("Votre nom *").fill("Patron Test");
      await page.getByLabel("Adresse e-mail *").fill(`${sousDomaine}@exemple.test`);
      await page.getByLabel("Mot de passe *", { exact: true }).fill("motdepasse-long");
      await page.getByLabel("Confirmer le mot de passe *").fill("motdepasse-long");
      await expect_(page.getByText("Comment voulez-vous commencer ?")).toBeVisible();
      await page.getByRole("radio", { name: new RegExp(`^${choix}`) }).check();
      await page.getByRole("button", { name: "Créer mon compte" }).click();
      await expect_(page.getByRole("heading", { name: /Votre hôtel est créé/ })).toBeVisible(30_000);
      const liens = page.locator(".parcours-payer").getByRole("link", { name: "Payer mon abonnement" });
      await expect_(liens).toHaveCount(attendLien ? 1 : 0);
      if (attendLien) expect(await liens.first().getAttribute("href")).toBe(`/payer?email=${encodeURIComponent(`${sousDomaine}@exemple.test`)}`);
      const hotel = await p.hotel.findFirst({ where: { sousDomaine } });
      expect(hotel).toBeTruthy();
      // Dans les deux cas l'essai gratuit existe : payer d'avance ne le supprime jamais.
      expect(hotel.statutLicence).toBe("ESSAI");
    }
  });
});

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
