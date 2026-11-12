import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import * as jwt from "jsonwebtoken";
import { prisma } from "@hotel-chicago/database";
import { AppModule } from "../../src/app.module";
import { VERIFICATEUR_JWT, VerificateurJwtHs256 } from "../../src/common/auth/verificateur-jwt";
import { SupabaseAdminService } from "../../src/common/supabase-admin/supabase-admin.service";
import { decrire, verifierBaseJetable } from "./base";
import { JeuHotel, creerHotel, viderBase } from "./donnees";

const SECRET = "secret-de-test-integration";

/** Changement de compte du patron (12/11/2026) : la route /auth/basculer avec une vraie base, deux hôtels, et un faux Supabase. */
decrire("Changement de compte du patron (POST /auth/basculer)", () => {
  let app: INestApplication;
  let A: JeuHotel;
  let B: JeuHotel;
  const emailsDemandes: string[] = [];
  const tok = (authId: string) => `Bearer ${jwt.sign({ sub: authId }, SECRET)}`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    verifierBaseJetable();
    await viderBase(prisma);
    A = await creerHotel(prisma, "A");
    B = await creerHotel(prisma, "B");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICATEUR_JWT)
      .useValue(new VerificateurJwtHs256(SECRET))
      .overrideProvider(SupabaseAdminService)
      .useValue({
        lireEmailCompte: async (id: string) => `${id}@exemple.test`,
        creerSessionPour: async (email: string) => {
          emailsDemandes.push(email);
          return { access_token: `jeton-de-${email}`, refresh_token: "renouvellement", expires_in: 3600 };
        },
        supprimerCompte: async () => undefined,
        mettreAJourCompte: async () => undefined,
        envoyerRecuperation: async () => undefined,
        idDepuisJeton: async () => null,
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    emailsDemandes.length = 0;
  });

  it("le patron obtient une session pour le compte de la cafétaria ET pour celui de la réception de SON hôtel", async () => {
    for (const role of ["caf", "recep"] as const) {
      const r = await http().post("/auth/basculer").set("Authorization", tok(A.auth.patron)).send({ utilisateurId: A.userIds[role] });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ refresh_token: "renouvellement", expires_in: 3600 });
      expect(r.body.access_token).toContain(A.auth[role]);
    }
    expect(emailsDemandes).toHaveLength(2);
  });

  it("la réception et la cafétaria ne peuvent PAS changer de compte (403), pas plus qu'un visiteur sans jeton (401)", async () => {
    for (const role of ["recep", "caf"] as const) {
      const r = await http().post("/auth/basculer").set("Authorization", tok(A.auth[role])).send({ utilisateurId: A.userIds.patron });
      expect(r.status).toBe(403);
    }
    expect((await http().post("/auth/basculer").send({ utilisateurId: A.userIds.caf })).status).toBe(401);
    expect(emailsDemandes).toHaveLength(0);
  });

  it("un patron ne peut pas ouvrir un compte d'un AUTRE hôtel : introuvable (404), aucune session créée", async () => {
    for (const role of ["patron", "recep", "caf"] as const) {
      const r = await http().post("/auth/basculer").set("Authorization", tok(A.auth.patron)).send({ utilisateurId: B.userIds[role] });
      expect(r.status).toBe(404);
    }
    expect(emailsDemandes).toHaveLength(0);
  });

  it("refus : soi-même, identifiant manquant ou inconnu, compte désactivé", async () => {
    const patron = tok(A.auth.patron);
    expect((await http().post("/auth/basculer").set("Authorization", patron).send({ utilisateurId: A.userIds.patron })).status).toBe(400);
    expect((await http().post("/auth/basculer").set("Authorization", patron).send({})).status).toBe(400);
    expect((await http().post("/auth/basculer").set("Authorization", patron).send({ utilisateurId: "00000000-0000-0000-0000-000000000000" })).status).toBe(404);
    await prisma.utilisateur.update({ where: { id: A.userIds.recep }, data: { actif: false } });
    const desactive = await http().post("/auth/basculer").set("Authorization", patron).send({ utilisateurId: A.userIds.recep });
    expect(desactive.status).toBe(400);
    await prisma.utilisateur.update({ where: { id: A.userIds.recep }, data: { actif: true } });
    expect(emailsDemandes).toHaveLength(0);
  });
});
