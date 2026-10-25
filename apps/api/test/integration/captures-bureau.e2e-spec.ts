/**
 * Photographie chaque écran de l'application bureau dans un vrai Chromium, avec un hôtel bien rempli, à plusieurs tailles de fenêtre.
 * Sert à contrôler l'ergonomie : à lancer après `pnpm --filter @hotel-chicago/desktop build`.
 *
 *   TEST_INTEGRATION=1 TEST_CAPTURES=1 CAPTURES_DIR=/chemin DATABASE_URL=… pnpm --filter @hotel-chicago/api test:integration -- captures-bureau
 *   Variables facultatives : CAPTURES_ROLES=patron,recep,caf · CAPTURES_TAILLES=1440x900,1280x720,1920x1080 · CAPTURES_PAGES="Chambres,Stock"
 */
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as jwt from "jsonwebtoken";
import { chromium, type Browser, type Page } from "playwright-core";
import { prisma } from "@hotel-chicago/database";
import { AppModule } from "../../src/app.module";
import { VERIFICATEUR_JWT, VerificateurJwtHs256 } from "../../src/common/auth/verificateur-jwt";
import { SupabaseAdminService } from "../../src/common/supabase-admin/supabase-admin.service";
import { decrire, verifierBaseJetable } from "./base";
import { JeuHotel, creerHotel, viderBase } from "./donnees";

const SECRET = "secret-de-test-integration";
const p = prisma as any;
const RENDERER = join(__dirname, "../../../desktop/out/renderer");
const SORTIE = process.env.CAPTURES_DIR ?? "";
const ACTIF = process.env.TEST_CAPTURES === "1" && SORTIE !== "" && existsSync(join(RENDERER, "index.html"));
const MOT_DE_PASSE = "motdepasse-test";
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml" };
const ROLES = (process.env.CAPTURES_ROLES ?? "patron,recep,caf").split(",");
const TAILLES = (process.env.CAPTURES_TAILLES ?? "1440x900,1280x720,1920x1080").split(",").map((t) => t.split("x").map(Number) as [number, number]);

const PAGES_PAR_ROLE: Record<string, string[]> = {
  patron: ["Tableau de bord", "Chambres", "Réservations", "Remboursements", "Arrivées et départs", "Journal de la journée", "Clients", "Facturation", "Caisse", "Comptes ouverts", "Retrait commande", "Cuisine", "Menu", "Stock", "Inventaire", "Rapports mensuels", "Dépenses", "Site de l'hôtel", "Guide d'utilisation", "Paramètres"],
  recep: ["Tableau de bord", "Chambres", "Réservations", "Arrivées et départs", "Journal de la journée", "Clients", "Facturation", "Rapports mensuels", "Dépenses"],
  caf: ["Tableau de bord", "Caisse", "Comptes ouverts", "Retrait commande", "Cuisine", "Menu", "Stock", "Inventaire", "Rapports mensuels", "Dépenses"],
};

/** Écrans secondaires : après avoir ouvert la page, on clique sur le bouton puis on photographie le formulaire ou la fenêtre qui s'ouvre. */
const ACTIONS: { role: string; page: string; bouton: RegExp; nom: string }[] = [
  { role: "patron", page: "Chambres", bouton: /Nouvelle chambre/, nom: "formulaire-nouvelle-chambre" },
  { role: "patron", page: "Réservations", bouton: /Nouvelle réservation/, nom: "formulaire-nouvelle-reservation" },
  { role: "patron", page: "Menu", bouton: /Nouveau produit/, nom: "formulaire-nouveau-produit" },
  { role: "patron", page: "Stock", bouton: /Nouveau mouvement/, nom: "formulaire-nouveau-mouvement" },
  { role: "recep", page: "Dépenses", bouton: /Nouvelle dépense/, nom: "formulaire-depense" },
  { role: "recep", page: "Facturation", bouton: /^Détail$/, nom: "detail-recu" },
  { role: "recep", page: "Réservations", bouton: /Nouvelle réservation/, nom: "formulaire-nouvelle-reservation" },
  { role: "caf", page: "Caisse", bouton: /Vente rapide|Ouvrir le compte/, nom: "caisse-vente-rapide" },
  { role: "caf", page: "Comptes ouverts", bouton: /^Ouvrir$/, nom: "compte-detail" },
];

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Remplit l'hôtel pour que les écrans ressemblent à un vrai hôtel en service (listes longues, statuts variés, noms longs). */
async function remplir(A: JeuHotel) {
  const j = (n: number) => new Date(Date.now() + n * 86_400_000);
  const statuts = ["LIBRE", "OCCUPEE", "RESERVEE", "NETTOYAGE", "LIBRE", "OCCUPEE", "LIBRE", "NETTOYAGE", "RESERVEE", "LIBRE"];
  const types = ["Standard", "Confort", "Suite", "Standard", "Confort", "Suite familiale", "Standard", "Confort", "Standard", "Suite"];
  const chambres: any[] = [];
  for (let i = 0; i < 10; i += 1) {
    chambres.push(await p.chambre.create({ data: { hotelId: A.hotelId, numero: String(201 + i), type: types[i], prixParNuit: 45 + (i % 4) * 20, devise: "USD", statut: statuts[i] } }));
  }
  const noms = ["Jean-Baptiste Mukendi Ilunga", "Aline Kabila", "Patrick Mwamba", "Grâce Tshibola", "Christian Ngoy", "Marie-Louise Kalala", "Joël Kazadi", "Sylvie Banza", "Eric Mutombo", "Nadine Kasongo"];
  const clients: any[] = [];
  for (let i = 0; i < noms.length; i += 1) {
    clients.push(await p.client.create({ data: { hotelId: A.hotelId, nom: noms[i], telephone: `+24381${String(1000000 + i * 137).slice(0, 7)}`, email: i % 3 === 0 ? `client${i}@exemple.cd` : null, typePiece: i % 2 ? "CNI" : "PASSEPORT", numeroPiece: `PC${100000 + i}` } }));
  }
  const etats: [string, number, number][] = [["EN_COURS", -2, 1], ["EN_COURS", -1, 2], ["CONFIRMEE", 0, 2], ["CONFIRMEE", 1, 3], ["CONFIRMEE", 2, 5], ["CONFIRMEE", 6, 9], ["TERMINEE", -9, -6], ["TERMINEE", -7, -5], ["ANNULEE", 3, 4]];
  for (let i = 0; i < etats.length; i += 1) {
    const [statut, a, d] = etats[i];
    const r = await p.reservation.create({ data: { hotelId: A.hotelId, chambreId: chambres[i % 10].id, clientId: clients[i % 10].id, dateArrivee: j(a), dateDepart: j(d), statut, origine: i % 3 === 0 ? "EN_LIGNE" : "RECEPTION", createdBy: A.userIds.recep } });
    if (statut === "TERMINEE") {
      await p.facture.create({ data: { hotelId: A.hotelId, reservationId: r.id, montantChambre: 120 + i * 10, deviseChambre: "USD", montantTotalUSD: 120 + i * 10, modePaiement: i % 2 ? "MOBILE_MONEY" : "CASH", numeroRecu: `REC-202610${10 + i}-000${i + 2}` } });
    }
  }
  const produits: [string, string, number, number, string?][] = [
    ["Primus 72 cl", "Boissons", 3.5, 48], ["Fanta 33 cl", "Boissons", 1.5, 4], ["Eau minérale 1,5 l", "Boissons", 2, 30], ["Whisky Jack Daniel's", "Boissons", 6, 12],
    ["Café noir", "Boissons chaudes", 1, 100], ["Thé gingembre", "Boissons chaudes", 1, 60], ["Capitaine grillé", "Plats", 14, 0, "PLAT"], ["Poulet braisé", "Plats", 12, 0, "PLAT"],
    ["Brochettes de chèvre", "Plats", 9, 0, "PLAT"], ["Riz aux légumes", "Plats", 7, 0, "PLAT"], ["Frites de manioc", "Accompagnements", 3, 20], ["Salade composée", "Entrées", 5, 8],
  ];
  for (const [nom, categorie, prix, stock, type] of produits) {
    await p.produit.create({ data: { hotelId: A.hotelId, nom, categorie, prix, devise: "USD", stockActuel: stock, typeProduit: type ?? "ARTICLE", commandableEnLigne: type === "PLAT" } });
  }
  for (let i = 0; i < 8; i += 1) {
    await p.depense.create({ data: { hotelId: A.hotelId, departement: i % 2 ? "CAFETERIA" : "RECEPTION", date: j(-i), motif: ["Achat de savon et produits d'entretien", "Réparation climatiseur chambre 204", "Gaz cuisine", "Poissons frais", "Transport", "Papier imprimante", "Eau", "Boissons"][i], montant: 5 + i * 7, devise: i % 4 === 0 ? "CDF" : "USD", creeParId: A.userIds.recep, creeParNom: "Recep A" } });
  }
  for (let i = 0; i < 4; i += 1) {
    const c = await p.compteCafeteria.create({ data: { hotelId: A.hotelId, tableOuNom: ["Table 4", "Terrasse 2", "M. Mukendi", "Table VIP"][i], ouvertPar: A.userIds.caf } });
    const sc = await p.sousCompte.create({ data: { hotelId: A.hotelId, compteId: c.id, nom: "Personne 1" } });
    const prod = await p.produit.findFirst({ where: { hotelId: A.hotelId, nom: i % 2 ? "Poulet braisé" : "Primus 72 cl" } });
    await p.ligneCommande.create({ data: { hotelId: A.hotelId, sousCompteId: sc.id, produitId: prod.id, quantite: 2 + i, prixUnitaire: prod.prix, devise: "USD" } });
  }
}

(ACTIF ? decrire : describe.skip)("Captures du bureau", () => {
  jest.setTimeout(30 * 60_000);
  let app: INestApplication;
  let supabase: Server;
  let statique: Server;
  let navigateur: Browser;
  let A: JeuHotel;
  let apiUrl = "";
  let supabaseUrl = "";
  let siteUrl = "";
  let qui: "patron" | "recep" | "caf" = "patron";

  beforeAll(async () => {
    verifierBaseJetable();
    await viderBase(prisma);
    await p.syncCorrespondance.deleteMany();
    await p.suppression.deleteMany();
    A = await creerHotel(prisma, "A");
    await p.hotel.update({ where: { id: A.hotelId }, data: { nom: "Hôtel Grand Lac" } });
    await remplir(A);

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

    let jetons = 0;
    supabase = createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      if (req.method === "OPTIONS") return res.writeHead(204).end();
      let corps = "";
      req.on("data", (c) => (corps += c));
      req.on("end", () => {
        const emis = () => {
          jetons += 1;
          return { access_token: jwt.sign({ sub: A.auth[qui] }, SECRET, { expiresIn: 3600 }), refresh_token: `rt-${jetons}`, expires_in: 3600 };
        };
        const rep = (s: number, o: object) => res.writeHead(s, { "Content-Type": "application/json" }).end(JSON.stringify(o));
        if (req.url?.includes("grant_type=password") || req.url?.includes("grant_type=refresh_token")) return rep(200, emis());
        return rep(404, {});
      });
    });
    await new Promise<void>((ok) => supabase.listen(0, "127.0.0.1", ok));
    supabaseUrl = `http://127.0.0.1:${(supabase.address() as AddressInfo).port}`;
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
  });

  afterAll(async () => {
    await navigateur?.close();
    await new Promise((ok) => statique?.close(ok));
    await new Promise((ok) => supabase?.close(ok));
    await app?.close();
  });

  async function ouvrirSession(role: typeof qui, largeur: number, hauteur: number): Promise<Page> {
    qui = role;
    const contexte = await navigateur.newContext({ viewport: { width: largeur, height: hauteur } });
    await contexte.addInitScript({
      content: `if (!localStorage.getItem("hotel-chicago:config-navigateur")) localStorage.setItem("hotel-chicago:config-navigateur", ${JSON.stringify(
        JSON.stringify({ apiUrl, supabaseUrl, supabaseAnonKey: "anon", refreshToken: null, imprimanteInterface: null }),
      )});`,
    });
    const page = await contexte.newPage();
    await page.goto(siteUrl);
    const champ = page.getByLabel("Adresse e-mail");
    if (!(await champ.isVisible().catch(() => false))) await page.getByRole("button", { name: /Ancien compte \? Se connecter avec un e-mail/ }).click();
    await champ.fill(`${A.auth[role]}@exemple.test`);
    await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await page.getByTestId("utilisateur-connecte").waitFor({ state: "attached", timeout: 30_000 });
    await page.waitForTimeout(2500);
    return page;
  }

  it("photographie tous les écrans", async () => {
    mkdirSync(SORTIE, { recursive: true });
    const rapport: string[] = [];
    for (const role of ROLES as (typeof qui)[]) {
      for (const [l, h] of TAILLES) {
        const page = await ouvrirSession(role, l, h);
        const dossier = join(SORTIE, `${l}x${h}`, role);
        mkdirSync(dossier, { recursive: true });
        const erreurs: string[] = [];
        page.on("pageerror", (e) => erreurs.push(String(e)));
        for (const libelle of PAGES_PAR_ROLE[role].filter((n) => !process.env.CAPTURES_PAGES || process.env.CAPTURES_PAGES.split(",").includes(n))) {
          let ok = true;
          const nom = libelle === "Paramètres" ? "Paramètres" : new RegExp(`^${libelle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
          const laterale = page.getByRole("complementary", { name: "Navigation principale" });
          if (await laterale.isVisible().catch(() => false)) {
            await laterale.getByRole("button", { name: nom }).first().click({ timeout: 4000 }).catch(() => (ok = false));
          } else {
            // Fenêtre étroite : la barre du bas montre quelques entrées, le reste est dans le tiroir « Plus ».
            const bas = page.getByRole("navigation", { name: "Navigation rapide" }).getByRole("button", { name: nom }).first();
            if (await bas.isVisible().catch(() => false)) await bas.click().catch(() => (ok = false));
            else {
              await page.getByRole("button", { name: /^Plus/ }).first().click({ timeout: 4000 }).catch(() => (ok = false));
              await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: nom }).first().click({ timeout: 4000 }).catch(() => (ok = false));
            }
          }
          if (!ok) {
            rapport.push(`${role} ${l}x${h} : entrée « ${libelle} » introuvable dans la barre latérale`);
            continue;
          }
          await page.waitForTimeout(1200);
          await page.screenshot({ path: join(dossier, `${slug(libelle)}.png`) });
          // Défilement horizontal parasite : signe d'une page qui dépasse de la fenêtre.
          const debord = (await page.evaluate("({ x: document.documentElement.scrollWidth - window.innerWidth, hauteur: document.documentElement.scrollHeight })")) as { x: number; hauteur: number };
          if (debord.x > 2) rapport.push(`${role} ${l}x${h} ${libelle} : la page déborde de ${debord.x}px en largeur`);
        }
        for (const act of ACTIONS.filter((x) => x.role === role && (!process.env.CAPTURES_ACTIONS || process.env.CAPTURES_ACTIONS === "1"))) {
          const laterale = page.getByRole("complementary", { name: "Navigation principale" });
          if (!(await laterale.isVisible().catch(() => false))) continue;
          await laterale.getByRole("button", { name: new RegExp(`^${act.page}`) }).first().click({ timeout: 4000 }).catch(() => undefined);
          await page.waitForTimeout(900);
          const bouton = page.getByRole("button", { name: act.bouton }).first();
          if (!(await bouton.isVisible().catch(() => false))) {
            rapport.push(`${role} ${l}x${h} : bouton « ${act.bouton} » absent sur ${act.page}`);
            continue;
          }
          await bouton.click().catch(() => undefined);
          await page.waitForTimeout(1200);
          await page.screenshot({ path: join(dossier, `${act.nom}.png`) });
          await page.keyboard.press("Escape");
        }
        if (erreurs.length) rapport.push(`${role} ${l}x${h} : erreurs JS ${erreurs.slice(0, 3).join(" | ")}`);
        await page.context().close();
      }
    }
    // eslint-disable-next-line no-console
    console.log(`RAPPORT\n${rapport.join("\n") || "rien à signaler"}`);
  });
});
