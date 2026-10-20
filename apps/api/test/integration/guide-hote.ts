/**
 * Hôte de démonstration du guide utilisateur : un hôtel fictif (« Hôtel Grand Lac »), le vrai serveur, un faux serveur d'authentification et
 * l'application bureau compilée, sur des ports fixes. Utilisé par guide-serveur.e2e-spec.ts (voir docs/guide/README.md).
 */
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as jwt from "jsonwebtoken";
import { prisma } from "@hotel-chicago/database";
import { AppModule } from "../../src/app.module";
import { VERIFICATEUR_JWT, VerificateurJwtHs256 } from "../../src/common/auth/verificateur-jwt";
import { SupabaseAdminService } from "../../src/common/supabase-admin/supabase-admin.service";
import { verifierBaseJetable } from "./base";
import { reinitialiserCatalogue, viderBase } from "./donnees";

const SECRET = "secret-de-test-integration";
const p = prisma as any;
export const RENDERER = join(__dirname, "../../../desktop/out/renderer");
export const MOT_DE_PASSE = "motdepasse-test";
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml" };

const jour = (decalage: number, heure = 12) => {
  const d = new Date();
  d.setUTCHours(heure, 0, 0, 0);
  return new Date(d.getTime() + decalage * 86_400_000);
};

async function semer() {
  const hotel = await p.hotel.create({
    data: {
      nom: "Hôtel Grand Lac", sousDomaine: "grand-lac", statutLicence: "ACTIF", cuisineActivee: true, commandeWebActivee: true,
      branding: { create: { palette: { claire: { primary: "#1769E0" }, sombre: { primary: "#4C8DF0" } } } },
    },
  });
  const hotelId: string = hotel.id;
  const comptes = {
    patron: { nom: "Joël Kambale", role: "PATRON", auth: "gl-patron" },
    recep: { nom: "Aline Masika", role: "RECEPTIONNISTE", auth: "gl-recep" },
    caf: { nom: "Sylvie Katungu", role: "CAFETARIA", auth: "gl-caf" },
  };
  const u: Record<string, any> = {};
  for (const [cle, c] of Object.entries(comptes)) {
    u[cle] = await p.utilisateur.create({ data: { hotelId, nom: c.nom, role: c.role, supabaseAuthId: c.auth, email: `${c.auth}@exemple.test` } });
  }
  await p.tauxChange.create({ data: { hotelId, cdfParUsd: 2800, definiPar: u.patron.id } });

  const types: [string, string, number, string][] = [
    ["101", "Standard", 45, "OCCUPEE"], ["102", "Standard", 45, "LIBRE"], ["103", "Standard", 45, "NETTOYAGE"], ["104", "Confort", 70, "RESERVEE"],
    ["105", "Confort", 70, "LIBRE"], ["106", "Confort", 70, "OCCUPEE"], ["201", "Suite", 120, "LIBRE"], ["202", "Suite", 120, "RESERVEE"],
  ];
  const ch: Record<string, any> = {};
  for (const [numero, type, prix, statut] of types) ch[numero] = await p.chambre.create({ data: { hotelId, numero, type, prixParNuit: prix, devise: "USD", statut } });

  const noms: [string, string][] = [
    ["Jean-Pierre Mukendi", "+243810000101"], ["Grâce Kabasele", "+243820000102"], ["Patrick Ilunga", "+243990000103"], ["Esther Mbuyi", "+243850000104"],
    ["Daniel Tshimanga", "+243970000105"], ["Chantal Mwamba", "+243810000106"],
  ];
  const cl: any[] = [];
  for (const [nom, telephone] of noms) cl.push(await p.client.create({ data: { hotelId, nom, telephone } }));
  const res = (c: number, n: string, a: number, d: number, statut: string, extra: object = {}) =>
    p.reservation.create({ data: { hotelId, chambreId: ch[n].id, clientId: cl[c].id, dateArrivee: jour(a, 14), dateDepart: jour(d, 11), statut, origine: "RECEPTION", createdBy: u.recep.id, ...extra } });
  await res(0, "101", -1, 2, "EN_COURS", { arriveeLe: jour(-1, 15) });
  await res(1, "106", -2, 1, "EN_COURS", { arriveeLe: jour(-2, 16) });
  await res(2, "104", 0, 3, "CONFIRMEE", { acompte: 30 });
  await res(3, "202", 1, 4, "CONFIRMEE", { origine: "SITE_PUBLIC", acompte: 60 });
  await res(4, "105", 5, 7, "CONFIRMEE");
  const finie = await res(5, "102", -4, -1, "TERMINEE", { arriveeLe: jour(-4, 15), departLe: jour(-1, 10) });
  await p.facture.create({ data: { hotelId, reservationId: finie.id, montantChambre: 135, deviseChambre: "USD", montantTotalUSD: 135, modePaiement: "CASH", numeroRecu: "REC-20261019-0001" } });

  const prod = async (nom: string, categorie: string, prix: number, stock: number, extra: object = {}) =>
    p.produit.create({ data: { hotelId, nom, categorie, prix, devise: "USD", stockActuel: stock, ...extra } });
  const primus = await prod("Primus 72 cl", "Boissons", 3, 48);
  const coca = await prod("Coca-Cola 33 cl", "Boissons", 1.5, 36);
  const eau = await prod("Eau minérale", "Boissons", 1, 60);
  await prod("Fanta 33 cl", "Boissons", 1.5, 4);
  const poulet = await prod("Poulet braisé", "Plats", 9, 0, { typeProduit: "PLAT", commandableEnLigne: true });
  const capitaine = await prod("Capitaine grillé", "Plats", 12, 0, { typeProduit: "PLAT", commandableEnLigne: true });
  await prod("Riz et haricots", "Plats", 5, 0, { typeProduit: "PLAT", commandableEnLigne: true });
  for (const x of [primus, coca, eau]) await p.mouvementStock.create({ data: { hotelId, produitId: x.id, quantite: 48, type: "ENTREE", createdBy: u.caf.id } });
  const menu = await p.menuDuJour.create({ data: { hotelId, date: new Date(), createdBy: u.caf.id } });
  for (const x of [poulet, capitaine]) await p.menuDuJourItem.create({ data: { menuId: menu.id, produitId: x.id } });

  const compte = await p.compteCafeteria.create({ data: { hotelId, tableOuNom: "Table 4", ouvertPar: u.caf.id } });
  const sc = await p.sousCompte.create({ data: { hotelId, compteId: compte.id, nom: "Client" } });
  await p.ligneCommande.create({ data: { hotelId, sousCompteId: sc.id, produitId: poulet.id, quantite: 2, prixUnitaire: 9, devise: "USD" } });
  await p.ligneCommande.create({ data: { hotelId, sousCompteId: sc.id, produitId: primus.id, quantite: 2, prixUnitaire: 3, devise: "USD" } });
  const ferme = await p.compteCafeteria.create({ data: { hotelId, tableOuNom: "Table 2", ouvertPar: u.caf.id, statut: "FERME", fermeLe: new Date() } });
  await p.venteCafeteria.create({ data: { hotelId, compteId: ferme.id, montantTotalUSD: 18, modePaiement: "CASH", numeroRecu: "REC-20261020-0001", createdBy: u.caf.id } });
  await p.depense.create({ data: { hotelId, departement: "CAFETERIA", date: new Date(), motif: "Achat de charbon", montant: 12, devise: "USD", creeParId: u.caf.id, creeParNom: comptes.caf.nom } });
  await p.depense.create({ data: { hotelId, departement: "RECEPTION", date: new Date(), motif: "Produits d'entretien", montant: 20, devise: "USD", creeParId: u.recep.id, creeParNom: comptes.recep.nom } });
  return { hotelId, comptes };
}


export interface Hote {
  apiUrl: string;
  supabaseUrl: string;
  siteUrl: string;
  arreter(): Promise<void>;
}

/** `portBase` : API = base+1, authentification = base+2, application = base+3. */
export async function demarrerHote(portBase: number): Promise<Hote> {
  verifierBaseJetable();
  await viderBase(prisma);
  await p.syncCorrespondance.deleteMany();
  await p.suppression.deleteMany();
  await reinitialiserCatalogue(prisma);
  await semer();

  const jetons = { n: 0 };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(VERIFICATEUR_JWT)
    .useValue(new VerificateurJwtHs256(SECRET))
    .overrideProvider(SupabaseAdminService)
    .useValue({ supprimerCompte: async () => undefined, mettreAJourCompte: async () => undefined, envoyerRecuperation: async () => undefined, idDepuisJeton: async () => null })
    .compile();
  const app: INestApplication = moduleRef.createNestApplication();
  app.enableCors();
  await app.listen(portBase + 1, "127.0.0.1");

  const supabase: Server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") return res.writeHead(204).end();
    let corps = "";
    req.on("data", (c) => (corps += c));
    req.on("end", () => {
      const donnees = corps ? JSON.parse(corps) : {};
      const reponse = (statut: number, objet: object) => res.writeHead(statut, { "Content-Type": "application/json" }).end(JSON.stringify(objet));
      const emis = (sub: string) => {
        jetons.n += 1;
        return { access_token: jwt.sign({ sub }, SECRET, { expiresIn: 86_400 }), refresh_token: `rt-${sub}-${jetons.n}`, expires_in: 86_400 };
      };
      if (req.url?.includes("grant_type=password")) {
        const m = /^(gl-[a-z]+)@exemple\.test$/.exec(String(donnees.email));
        return m && donnees.password === MOT_DE_PASSE ? reponse(200, emis(m[1])) : reponse(400, { error_code: "invalid_credentials" });
      }
      if (req.url?.includes("grant_type=refresh_token")) {
        const m = /^rt-(gl-[a-z]+)-/.exec(String(donnees.refresh_token));
        return m ? reponse(200, emis(m[1])) : reponse(400, { error_code: "refresh_token_not_found" });
      }
      return reponse(404, {});
    });
  });
  await new Promise<void>((ok) => supabase.listen(portBase + 2, "127.0.0.1", ok));
  process.env.SUPABASE_URL = `http://127.0.0.1:${portBase + 2}`;
  process.env.SUPABASE_ANON_KEY = "anon";

  const statique: Server = createServer((req, res) => {
    const chemin = join(RENDERER, decodeURIComponent((req.url ?? "/").split("?")[0]));
    const fichier = existsSync(chemin) && statSync(chemin).isFile() ? chemin : join(RENDERER, "index.html");
    res.writeHead(200, { "Content-Type": TYPES[extname(fichier)] ?? "application/octet-stream" }).end(readFileSync(fichier));
  });
  await new Promise<void>((ok) => statique.listen(portBase + 3, "127.0.0.1", ok));

  return {
    apiUrl: `http://127.0.0.1:${portBase + 1}`,
    supabaseUrl: `http://127.0.0.1:${portBase + 2}`,
    siteUrl: `http://127.0.0.1:${portBase + 3}/`,
    arreter: async () => {
      await new Promise((ok) => statique.close(ok));
      await new Promise((ok) => supabase.close(ok));
      await app.close();
    },
  };
}
