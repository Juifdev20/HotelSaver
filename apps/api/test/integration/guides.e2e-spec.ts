import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import * as jwt from "jsonwebtoken";
import { prisma } from "@hotel-chicago/database";
import { AppModule } from "../../src/app.module";
import { VERIFICATEUR_JWT, VerificateurJwtHs256 } from "../../src/common/auth/verificateur-jwt";
import { SupabaseAdminService } from "../../src/common/supabase-admin/supabase-admin.service";
import { SupabaseStorageService } from "../../src/common/supabase-storage/supabase-storage.service";
import { decrire, verifierBaseJetable } from "./base";
import { JeuHotel, creerHotel, viderBase } from "./donnees";

const SECRET = "secret-de-test-integration";
const p = prisma as any;

/**
 * Guides d'utilisation (20/10/2026) : vraies routes, vrais contrôles d'accès, vraie base. Seul le stockage Supabase est simulé
 * (les fichiers « déposés » sont ceux dont l'envoi a été préparé, sauf `nonRecu`).
 */
decrire("Guides d'utilisation : publication par le super-admin, lecture selon le rôle (vraie base)", () => {
  let app: INestApplication;
  let A: JeuHotel;
  const deposes = new Set<string>();
  const stockage = {
    urlEnvoiGuide: async (chemin: string) => {
      deposes.add(chemin);
      return `https://stockage.test/envoi/${chemin}`;
    },
    tailleGuide: async (chemin: string) => (deposes.has(chemin) ? 2_000_000 : null),
    urlSigneeGuide: async (chemin: string, secondes: number, nom: string) => `https://stockage.test/signe/${chemin}?expire=${secondes}&download=${nom}`,
  };

  const tok = (authId: string) => `Bearer ${jwt.sign({ sub: authId }, SECRET)}`;
  const http = () => request(app.getHttpServer());
  const SA = tok("super-admin-auth");

  beforeAll(async () => {
    verifierBaseJetable();
    await viderBase(prisma);
    A = await creerHotel(prisma, "A");
    await p.superAdmin.create({ data: { nom: "Moi", supabaseAuthId: "super-admin-auth" } });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICATEUR_JWT)
      .useValue(new VerificateurJwtHs256(SECRET))
      .overrideProvider(SupabaseAdminService)
      .useValue({ supprimerCompte: async () => undefined, mettreAJourCompte: async () => undefined, envoyerRecuperation: async () => undefined, idDepuisJeton: async () => null })
      .overrideProvider(SupabaseStorageService)
      .useValue(stockage)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function publier(guide: string, edition?: string) {
    const envoi = await http().post("/super-admin/guides/envoi").set("Authorization", SA).send({ guide }).expect(201);
    return http().post("/super-admin/guides").set("Authorization", SA).send({ guide, chemin: envoi.body.chemin, edition });
  }

  it("seul le super-admin peut publier : un patron est refusé", async () => {
    await http().post("/super-admin/guides/envoi").set("Authorization", tok(A.auth.patron)).send({ guide: "PATRON" }).expect(401);
    await http().get("/super-admin/guides").expect(401);
  });

  it("le super-admin publie : version 1 puis 2, avec la taille réelle du fichier", async () => {
    expect((await publier("RECEPTION", "Édition 1.0")).status).toBe(201);
    const r = await publier("RECEPTION", "Édition 1.1");
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ guide: "RECEPTION", version: 2, taille: 2_000_000, edition: "Édition 1.1" });
    await publier("PATRON");
    await publier("COMPLET");
  });

  it("refuse un fichier jamais reçu, ou le chemin d'un autre guide", async () => {
    await http().post("/super-admin/guides").set("Authorization", SA).send({ guide: "PATRON", chemin: "PATRON/0f8b2c1e-1a2b-4c3d-8e9f-0123456789ab.pdf" }).expect(400);
    const envoi = await http().post("/super-admin/guides/envoi").set("Authorization", SA).send({ guide: "RECEPTION" }).expect(201);
    await http().post("/super-admin/guides").set("Authorization", SA).send({ guide: "PATRON", chemin: envoi.body.chemin }).expect(400);
    await http().post("/super-admin/guides/envoi").set("Authorization", SA).send({ guide: "AUTRE" }).expect(400);
  });

  it("sans connexion : aucun guide, aucun lien", async () => {
    await http().get("/guides").expect(401);
    await http().get("/guides/COMPLET/lien").expect(401);
  });

  it("le patron voit tous les guides publiés (dernière version) et obtient un lien de 5 minutes", async () => {
    const r = await http().get("/guides").set("Authorization", tok(A.auth.patron)).expect(200);
    expect(r.body.map((g: { guide: string; version: number }) => [g.guide, g.version])).toEqual([["COMPLET", 1], ["PATRON", 1], ["RECEPTION", 2]]);
    const lien = await http().get("/guides/PATRON/lien").set("Authorization", tok(A.auth.patron)).expect(200);
    expect(lien.body.expireDans).toBe(300);
    expect(lien.body.url).toMatch(/expire=300/);
  });

  it("le réceptionniste ne voit et n'ouvre que le guide de la réception", async () => {
    const r = await http().get("/guides").set("Authorization", tok(A.auth.recep)).expect(200);
    expect(r.body.map((g: { guide: string }) => g.guide)).toEqual(["RECEPTION"]);
    await http().get("/guides/RECEPTION/lien").set("Authorization", tok(A.auth.recep)).expect(200);
    await http().get("/guides/PATRON/lien").set("Authorization", tok(A.auth.recep)).expect(403);
    await http().get("/guides/COMPLET/lien").set("Authorization", tok(A.auth.recep)).expect(403);
  });

  it("la cafétaria ne voit rien tant que son guide n'est pas publié, puis le sien seulement", async () => {
    expect((await http().get("/guides").set("Authorization", tok(A.auth.caf)).expect(200)).body).toEqual([]);
    await http().get("/guides/CAFETERIA/lien").set("Authorization", tok(A.auth.caf)).expect(404);
    await publier("CAFETERIA");
    const r = await http().get("/guides").set("Authorization", tok(A.auth.caf)).expect(200);
    expect(r.body.map((g: { guide: string }) => g.guide)).toEqual(["CAFETERIA"]);
    await http().get("/guides/RECEPTION/lien").set("Authorization", tok(A.auth.caf)).expect(403);
  });

  it("un compte désactivé n'a plus accès", async () => {
    await p.utilisateur.update({ where: { id: A.userIds.recep }, data: { actif: false } });
    await http().get("/guides").set("Authorization", tok(A.auth.recep)).expect(401);
    await http().get("/guides/RECEPTION/lien").set("Authorization", tok(A.auth.recep)).expect(401);
    await p.utilisateur.update({ where: { id: A.userIds.recep }, data: { actif: true } });
  });
});
