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
import { JeuHotel, creerHotel, uuid, viderBase } from "./donnees";
import { FauxLinkPay } from "./faux-linkpay";

const SECRET = "secret-de-test-integration";
const p = prisma as any;
const JOUR = 86_400_000;
const RENDERER = join(__dirname, "../../../desktop/out/renderer");
const ACTIF = process.env.TEST_NAVIGATEUR === "1" && existsSync(join(RENDERER, "index.html"));
const MOT_DE_PASSE = "motdepasse-test";

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml" };

(ACTIF ? decrire : describe.skip)("Bureau dans un vrai navigateur : abonnement (blocage, paiement Mobile Money, frais ScanLinkPay, bandeau), fonctions de la formule, acompte en ligne et remboursements", () => {
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
  /** D : formule Essentiel payée (réception seulement, ni cafétaria ni site ni acompte en ligne). E : formule Pro payée (tout sauf domaine), avec un acompte payé en ligne puis annulé. */
  let D: JeuHotel;
  let E: JeuHotel;
  const faux = new FauxLinkPay();
  let jetonsEmis = 0;

  const email = (authId: string) => `${authId}@exemple.test`;
  const menu = () => page.getByRole("complementary", { name: "Navigation principale" });

  beforeAll(async () => {
    verifierBaseJetable();
    await faux.demarrer();
    process.env.LINKPAY_API_URL = faux.url;
    process.env.LINKPAY_NUMERO_MARCHAND = "SLP-TEST01";
    faux.numerosConnus.set("SLP-HOTELA", "Hôtel A SARL");
    process.env.ABONNEMENT_TAUX_CDF = "2800";
    await viderBase(prisma);
    await p.syncCorrespondance.deleteMany();
    await p.suppression.deleteMany();
    A = await creerHotel(prisma, "A");
    B = await creerHotel(prisma, "B");
    C = await creerHotel(prisma, "C");
    D = await creerHotel(prisma, "D");
    E = await creerHotel(prisma, "E");
    // Essai de 14 jours + 3 jours de grâce : créé il y a 19 jours = accès coupé ; créé il y a 11 jours = il reste 3 jours.
    for (const j of [A, B]) {
      await p.hotel.update({ where: { id: j.hotelId }, data: { createdAt: new Date(Date.now() - 19 * JOUR), statutLicence: "SUSPENDU", suspensionManuelle: false } });
    }
    await p.hotel.update({ where: { id: C.hotelId }, data: { createdAt: new Date(Date.now() - 11 * JOUR), statutLicence: "ACTIF", suspensionManuelle: false } });
    // D et E ont payé : leurs fonctions sont celles de leur formule (Essentiel : réception seule ; Pro : tout sauf le domaine personnalisé).
    for (const [j, formule] of [[D, "ESSENTIEL"], [E, "PRO"]] as const) {
      await p.paiementLicence.create({ data: { hotelId: j.hotelId, montant: 59, devise: "USD", methode: "ESPECES", periodeCouverteJusquau: new Date(Date.now() + 60 * JOUR) } });
      await p.hotel.update({ where: { id: j.hotelId }, data: { formule, statutLicence: "ACTIF", suspensionManuelle: false } });
    }
    // E : un client a payé 30 $ d'acompte en ligne (compte ScanLinkPay SLP-CLIENT1), puis la réservation 101 a été annulée → un remboursement à décider.
    await p.reservation.update({ where: { id: E.reservationId }, data: { statut: "ANNULEE", annuleLe: new Date(), motifAnnulation: "Annulation par le client", acompte: 30 } });
    const paiement = await p.paiementReservation.create({
      data: {
        hotelId: E.hotelId, reservationId: E.reservationId, montant: 30, devise: "USD", pourcentage: 30, moyen: "MOBILE_MONEY", operateur: "VODACOM", statut: "REUSSI",
        modeleCommission: "CUSTOMER_PAID", commissionCentimes: 60, totalCentimes: 3060, cleIdempotence: uuid(), numeroScanLinkPayClient: "SLP-CLIENT1", confirmeLe: new Date(),
      },
    });
    await p.remboursement.create({
      data: {
        hotelId: E.hotelId, reservationId: E.reservationId, paiementReservationId: paiement.id, devise: "USD", montantPaye: 30, montantARembourser: 30, motif: "ANNULATION_CLIENT",
        destinataireScanLinkPay: "SLP-CLIENT1", destinataireTelephone: "+243869000000", clientNom: "Client-E",
      },
    });
    // E : l'autre réservation (chambre 102, en cours) porte un acompte de 20 $ ; D : une commande web pointe vers un écran de cafétaria.
    await p.reservation.update({ where: { id: E.reservationTermineeId }, data: { acompte: 20 } });
    // E : une chambre 777 déjà réservée (confirmée) et, pour les MÊMES dates, la demande d'un autre client encore en attente → la réception doit voir « Chambre déjà réservée ».
    const ch777 = await p.chambre.create({ data: { hotelId: E.hotelId, numero: "777", type: "Suite", prixParNuit: 90, devise: "USD" } });
    const dans = (n: number) => new Date(Date.now() + n * JOUR);
    await p.reservation.create({ data: { hotelId: E.hotelId, chambreId: ch777.id, clientId: E.clientId, dateArrivee: dans(20), dateDepart: dans(23), statut: "CONFIRMEE", origine: "SITE_PUBLIC", createdBy: E.userIds.recep } });
    await p.reservation.create({ data: { hotelId: E.hotelId, chambreId: ch777.id, clientId: E.clientId, dateArrivee: dans(21), dateDepart: dans(24), statut: "EN_ATTENTE", origine: "SITE_PUBLIC", createdBy: E.userIds.recep } });
    const notif = (j: JeuHotel, cle: string, type: string, titre: string, lien: object) =>
      p.notification.create({ data: { hotelId: j.hotelId, type, titre, corps: "Test navigateur.", roles: ["PATRON"], lien, cleDedup: cle } });
    await notif(E, "k-E-remb", "REMBOURSEMENT_A_FAIRE", "Acompte à rembourser ?", { ecran: "reservations", id: E.reservationId });
    await notif(E, "k-E-acompte", "ACOMPTE_PAYE_EN_LIGNE", "Acompte payé en ligne", { ecran: "reservations", id: E.reservationTermineeId });
    await notif(D, "k-D-web", "COMMANDE_WEB", "Commande web test", { ecran: "comptes-ouverts", id: uuid() });

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
    const comptes = new Set([A.auth.patron, A.auth.recep, B.auth.patron, B.auth.recep, C.auth.patron, C.auth.recep, D.auth.patron, D.auth.recep, E.auth.patron, E.auth.recep].map(email));
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
    // Depuis le 15/10/2026 la connexion passe par le relais de l'API (POST /auth/connexion), qui appelle Supabase : on lui montre le faux.
    process.env.SUPABASE_URL = supabaseUrl;
    process.env.SUPABASE_ANON_KEY = "anon";

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
    await saisirEmail(page, email(authId));
    await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
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
    // « Besoin d'aide ? » : le WhatsApp du support, en lien externe sûr (https, nouvelle fenêtre).
    await expect_(page.getByTestId("bloc-aide")).toContainText("Besoin d'aide ?");
    await expect_(page.getByTestId("aide-whatsapp")).toContainText("WhatsApp +243 828 497 218");
    const lien = page.getByTestId("aide-whatsapp");
    expect(await lien.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/243828497218/);
    expect(await lien.getAttribute("target")).toBe("_blank");
    expect(await lien.getAttribute("rel")).toContain("noopener");
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
    // (d) Aperçu des frais ScanLinkPay AVANT de payer : prix 59 $ + frais 1,18 $ (2 %) = 60,18 $ ; le bouton dit le total.
    await expect_(page.getByTestId("abonnement-detail-prix")).toContainText("Prix 59 $ + frais ScanLinkPay 1,18 $ = 60,18 $ à payer");
    await expect_(page.getByTestId("abonnement-recap")).toContainText("Vous allez payer 60,18 $ pour 1 mois de la formule Pro.");
    await expect_(page.getByTestId("abonnement-securise")).toContainText("Paiement sécurisé par ScanLinkPay");
    // Changer de durée refait l'aperçu : 3 mois = 177 $ + 3,54 $ = 180,54 $ ; revenir à 1 mois redonne 60,18 $ (une réponse périmée ne s'affiche jamais).
    await page.getByRole("radio", { name: /^3 mois/ }).check();
    await expect_(page.getByTestId("abonnement-detail-prix")).toContainText("= 180,54 $ à payer");
    await page.getByRole("radio", { name: /^1 mois/ }).check();
    await expect_(page.getByTestId("abonnement-detail-prix")).toContainText("= 60,18 $ à payer");
    await expect_(page.getByRole("button", { name: "Payer 60,18 $" })).toBeVisible();
    expect(faux.appels.some((a) => a.startsWith("GET /payment-requests/fees-preview"))).toBe(true);
    await page.getByRole("button", { name: "Payer 60,18 $" }).click();

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
    // La formule actuelle est signalée, et le détail des frais est gardé dans l'historique.
    await expect_(page.getByTestId("abonnement-formule-actuelle")).toContainText("Votre formule");
    await expect_(page.getByTestId("abonnement-historique-frais")).toContainText("frais ScanLinkPay 1,18 $ = 60,18 $");
    await expect_(page.getByTestId("bloc-aide")).toContainText("WhatsApp +243 828 497 218");
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

  it("(e) formule Essentiel : ni cafétaria, ni stock, ni menu, ni site dans la navigation ; un lien profond mène au panneau « non incluse » avec l'aide WhatsApp", async () => {
    await seConnecter(D.auth.patron);
    await expect_(menu()).toBeVisible(30_000);
    await expect_(menu().getByRole("button", { name: "Chambres", exact: true })).toBeVisible();
    await expect_(menu().getByRole("button", { name: "Réservations", exact: true })).toBeVisible();
    for (const nom of ["Caisse", "Comptes ouverts", "Retrait commande", "Cuisine", "Menu", "Stock", "Inventaire", "Site de l'hôtel"]) {
      await expect_(menu().getByRole("button", { name: nom, exact: true })).toHaveCount(0);
    }
    await expect_(menu().getByText("Cafétaria", { exact: true })).toHaveCount(0);
    await expect_(menu().getByText("Mon hôtel", { exact: true })).toHaveCount(0);
    await expect_(page.getByText("Stock bas")).toHaveCount(0);
    await expect_(page.getByText("Dont cafétaria")).toHaveCount(0);
    await expect_(page.getByRole("alert")).toHaveCount(0);

    // Une notification pointe vers un écran de cafétaria : on explique au lieu d'afficher une erreur.
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await page.getByRole("button", { name: /Commande web test/ }).click();
    await expect_(page.getByTestId("fonction-non-incluse")).toContainText("Cette fonction n'est pas incluse dans votre formule");
    await expect_(page.getByRole("button", { name: "Voir les formules" })).toBeVisible();
    await expect_(page.getByTestId("bloc-aide")).toContainText("WhatsApp +243 828 497 218");

    // Paramètres : le paiement en ligne des acomptes est verrouillé (non inclus), avec un chemin vers les formules.
    await page.getByTestId("utilisateur-connecte").click();
    await page.getByRole("menuitem", { name: /Paramètres/ }).click();
    await expect_(page.getByTestId("paiement-en-ligne-verrouille")).toContainText("Votre formule actuelle ne l'inclut pas");
    await page.getByTestId("paiement-en-ligne").getByRole("button", { name: "Voir les formules" }).click();
    await expect_(page.getByRole("heading", { name: "Abonnement", level: 1 })).toBeVisible();
    await seDeconnecterDeLApplication();
  });

  it("(f) formule Pro : le patron relie son compte ScanLinkPay (nom vérifié), fixe 30 % et les conditions dans Paramètres", async () => {
    await seConnecter(E.auth.patron);
    await expect_(menu()).toBeVisible(30_000);
    await expect_(menu().getByRole("button", { name: "Stock", exact: true })).toBeVisible();
    await expect_(menu().getByRole("button", { name: "Site de l'hôtel", exact: true })).toBeVisible();
    await page.getByTestId("utilisateur-connecte").click();
    await page.getByRole("menuitem", { name: /Paramètres/ }).click();
    const carte = page.getByTestId("paiement-en-ligne");
    await expect_(carte).toContainText("Vos clients paient l'acompte de leur réservation");

    // Numéro inconnu de ScanLinkPay : l'erreur du serveur est affichée telle quelle.
    await page.getByLabel("Numéro ScanLinkPay de votre hôtel").fill("SLP-INCONNU");
    await page.getByRole("button", { name: "Vérifier et enregistrer" }).click();
    await expect_(page.getByTestId("scanlinkpay-erreur")).toContainText("introuvable");

    await page.getByLabel("Numéro ScanLinkPay de votre hôtel").fill("SLP-HOTELA");
    await page.getByRole("button", { name: "Vérifier et enregistrer" }).click();
    await expect_(page.getByTestId("scanlinkpay-compte-trouve")).toContainText("Compte trouvé : Hôtel A SARL");

    await page.getByLabel("Pourcentage demandé à la réservation").fill("30");
    await expect_(page.getByTestId("acompte-exemple")).toContainText("Chambre 20 $ × 4 nuits = 80 $ → acompte 30 % = 24 $");
    await page.getByRole("switch", { name: /frais ScanLinkPay/ }).uncheck();
    await page.getByLabel("Conditions d'annulation et de remboursement").fill("Annulation gratuite jusqu'à 48 h avant l'arrivée.");
    await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
    await expect_(page.getByTestId("paiement-en-ligne-enregistre")).toContainText("Réglages enregistrés.");
    const hotel = await p.hotel.findUnique({ where: { id: E.hotelId } });
    expect(hotel).toMatchObject({
      numeroScanLinkPay: "SLP-HOTELA",
      nomScanLinkPay: "Hôtel A SARL",
      pourcentageAcompte: 30,
      acompteFraisPayesParClient: false,
      conditionsAnnulation: "Annulation gratuite jusqu'à 48 h avant l'arrivée.",
    });
    await seDeconnecterDeLApplication();
  });

  it("(g) acompte payé en ligne puis réservation annulée : pastille « 1 », écran Remboursements, « J'ai remboursé » par ScanLinkPay → historique", async () => {
    await seConnecter(E.auth.patron);
    await expect_(menu()).toBeVisible(30_000);
    await expect_(page.getByTestId("pastille-remboursements")).toContainText("1", 30_000);

    // La réception et le patron voient d'un coup d'œil, dans la liste des réservations, que cet acompte a été payé en ligne (et qu'il attend une décision).
    await menu().getByRole("button", { name: "Réservations", exact: true }).click();
    await expect_(page.getByTestId("badge-paye-en-ligne")).toContainText("Payé en ligne · à rembourser ?", 30_000);
    // Demande en attente sur une chambre DÉJÀ réservée par un autre client : signalée en rouge dans la liste (une seule, celle de la chambre 777).
    await expect_(page.getByTestId("badge-chambre-deja-prise")).toContainText("Chambre déjà réservée");
    await expect_(page.getByTestId("badge-chambre-deja-prise")).toHaveCount(1);

    // La notification « Acompte à rembourser ? » ouvre l'écran Remboursements.
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await page.getByRole("button", { name: /Acompte à rembourser/ }).click();
    await expect_(page.getByRole("heading", { name: "Remboursements", level: 1 })).toBeVisible();
    await expect_(page.getByRole("tab", { name: "À faire (1)" })).toBeVisible();
    const carte = page.getByTestId("remboursement-carte");
    await expect_(carte).toContainText("Client-E");
    await expect_(carte).toContainText("Chambre 101");
    await expect_(page.getByTestId("remboursement-paye")).toContainText("30 $");
    await expect_(page.getByTestId("remboursement-numero")).toContainText("SLP-CLIENT1");
    await expect_(carte).toContainText("Envoyer → numéro du client");
    await expect_(carte).toContainText("Le client a annulé");

    // Plus que payé : refusé avant tout envoi.
    await page.getByLabel(/^Montant à rendre/).fill("50");
    await page.getByRole("button", { name: "J'ai remboursé" }).click();
    await expect_(page.getByRole("alert")).toContainText("plus que ce que le client a payé");
    expect(await p.remboursement.count({ where: { hotelId: E.hotelId, statut: "A_FAIRE" } })).toBe(1);

    // Remboursement partiel de 15 $ par ScanLinkPay, avec référence et confirmation.
    await page.getByLabel(/^Montant à rendre/).fill("15");
    await page.getByRole("button", { name: "J'ai remboursé" }).click();
    expect(await page.getByRole("radio", { name: "Par ScanLinkPay" }).isChecked()).toBe(true);
    await page.getByLabel("Référence de l'envoi (facultatif)").fill("TRX-9");
    await page.getByRole("button", { name: "Confirmer le remboursement" }).click();
    await expect_(page.getByRole("alert")).toContainText("Cochez la case");
    await page.getByRole("checkbox", { name: /Je confirme avoir rendu 15 \$/ }).check();
    await page.getByRole("button", { name: "Confirmer le remboursement" }).click();
    await expect_(page.getByTestId("remboursements-message")).toContainText("Remboursement enregistré : 15 $ rendus à Client-E.");
    await expect_(page.getByTestId("remboursements-vide")).toBeVisible();
    await expect_(page.getByTestId("pastille-remboursements")).toHaveCount(0);

    // Une fois remboursé, la liste des réservations le dit aussi.
    await menu().getByRole("button", { name: "Réservations", exact: true }).click();
    await expect_(page.getByTestId("badge-paye-en-ligne")).toContainText("Payé en ligne · remboursé", 30_000);
    await menu().getByRole("button", { name: "Remboursements", exact: true }).click();
    await page.getByRole("tab", { name: "Historique" }).click();
    const histo = page.getByTestId("remboursement-historique-carte");
    await expect_(histo).toContainText("Remboursé");
    await expect_(histo).toContainText("Rendu : 15 $ par ScanLinkPay");
    await expect_(histo).toContainText("TRX-9");
    const ligne = await p.remboursement.findFirst({ where: { hotelId: E.hotelId } });
    expect(ligne).toMatchObject({ statut: "EFFECTUE", mode: "SCANLINKPAY", reference: "TRX-9" });
    expect(Number(ligne.montantARembourser)).toBe(15);
    await seDeconnecterDeLApplication();
  });

  it("(h) annulation d'une réservation avec acompte : motif rapide « Client non présenté » et avertissement sur le remboursement (ouverte depuis la notification)", async () => {
    await seConnecter(E.auth.patron);
    await expect_(menu()).toBeVisible(30_000);
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await page.getByRole("button", { name: /Acompte payé en ligne/ }).click();
    await expect_(page.getByRole("button", { name: "Annuler", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    await page.getByRole("button", { name: "Client non présenté", exact: true }).click();
    expect(await page.inputValue("#motif-annulation")).toBe("Client non présenté");
    await expect_(page.getByTestId("annulation-avis-acompte")).toContainText("il apparaîtra dans Remboursements pour que vous décidiez de le rendre ou de le garder.");
    expect(await p.reservation.count({ where: { id: E.reservationTermineeId, statut: "ANNULEE" } })).toBe(0);
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

/** Saisit l'e-mail d'un ancien compte : la connexion se fait d'abord par numéro, la bascule « Ancien compte ? » ouvre le champ e-mail. */
async function saisirEmail(page: Page, email: string) {
  const champ = page.getByLabel("Adresse e-mail");
  if (!(await champ.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Ancien compte \? Se connecter avec un e-mail/ }).click();
  }
  await champ.fill(email);
}
