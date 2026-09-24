import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import * as jwt from "jsonwebtoken";
import { AppModule } from "../src/app.module";
import { PRISMA } from "../src/prisma/prisma.module";
import { VERIFICATEUR_JWT, VerificateurJwtHs256 } from "../src/common/auth/verificateur-jwt";

/**
 * Vérifie la matrice de permissions de la section 9.3 : chaque rôle reçoit
 * bien 200/403/401 selon les routes stub. Requis explicitement par la
 * section 14 du prompt d'origine.
 *
 * Le PrismaClient est mocké (pas de connexion réseau à Supabase pendant les
 * tests) : seul SupabaseAuthGuard.canActivate l'utilise, pour retrouver le
 * rôle d'un utilisateur à partir du `sub` du jeton.
 */
describe("Matrice de permissions (RolesGuard / SupabaseAuthGuard)", () => {
  const JWT_SECRET = "test-secret-ne-pas-utiliser-en-production";

  const utilisateurs: Record<
    string,
    { id: string; nom: string; role: string; actif: boolean; supabaseAuthId: string }
  > = {
    "auth-patron": {
      id: "u-patron",
      nom: "Le Patron",
      role: "PATRON",
      actif: true,
      supabaseAuthId: "auth-patron",
    },
    "auth-receptionniste": {
      id: "u-receptionniste",
      nom: "Réceptionniste Test",
      role: "RECEPTIONNISTE",
      actif: true,
      supabaseAuthId: "auth-receptionniste",
    },
    "auth-cafeteria": {
      id: "u-cafeteria",
      nom: "Serveur Test",
      role: "CAFETARIA",
      actif: true,
      supabaseAuthId: "auth-cafeteria",
    },
    "auth-inactif": {
      id: "u-inactif",
      nom: "Ancien Employé",
      role: "RECEPTIONNISTE",
      actif: false,
      supabaseAuthId: "auth-inactif",
    },
  };

  const prismaMock = {
    utilisateur: {
      findUnique: jest.fn(({ where: { supabaseAuthId } }: { where: { supabaseAuthId: string } }) =>
        Promise.resolve(utilisateurs[supabaseAuthId] ?? null)
      ),
    },
    // Ce test ne vérifie que la matrice de rôles (guards), pas la logique métier
    // réelle de Chambres/Réservations/Produits/Cafétaria (Phases 2-3) — chacune
    // a ses propres tests. Juste assez de surface ici pour que les routes GET
    // ne plantent pas en 500.
    chambre: { findMany: jest.fn().mockResolvedValue([]) },
    reservation: { findMany: jest.fn().mockResolvedValue([]) },
    produit: { findMany: jest.fn().mockResolvedValue([]) },
    mouvementStock: { findMany: jest.fn().mockResolvedValue([]) },
    compteCafeteria: { findMany: jest.fn().mockResolvedValue([]) },
    sousCompte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneCommande: { findMany: jest.fn().mockResolvedValue([]) },
    facture: { findMany: jest.fn().mockResolvedValue([]) },
    venteCafeteria: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const tokenPour = (supabaseAuthId: string) => jwt.sign({ sub: supabaseAuthId }, JWT_SECRET);
  const bearer = (supabaseAuthId: string) => `Bearer ${tokenPour(supabaseAuthId)}`;

  let app: INestApplication;

  beforeAll(async () => {

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PRISMA)
      .useValue(prismaMock)
      // Production vérifie via le JWKS Supabase (ES256) ; ici on signe nos
      // propres jetons HS256 pour tester la matrice de rôles sans réseau.
      .overrideProvider(VERIFICATEUR_JWT)
      .useValue(new VerificateurJwtHs256(JWT_SECRET))
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("refuse une requête sans jeton (401)", async () => {
    await request(app.getHttpServer()).get("/chambres").expect(401);
  });

  it("refuse un jeton d'utilisateur désactivé (401)", async () => {
    await request(app.getHttpServer())
      .get("/chambres")
      .set("Authorization", bearer("auth-inactif"))
      .expect(401);
  });

  describe("Chambres / Réservations — RECEPTIONNISTE et PATRON uniquement", () => {
    it.each(["/chambres", "/reservations"])("PATRON → 200 sur %s", async (route) => {
      await request(app.getHttpServer())
        .get(route)
        .set("Authorization", bearer("auth-patron"))
        .expect(200);
    });

    it.each(["/chambres", "/reservations"])("RECEPTIONNISTE → 200 sur %s", async (route) => {
      await request(app.getHttpServer())
        .get(route)
        .set("Authorization", bearer("auth-receptionniste"))
        .expect(200);
    });

    it.each(["/chambres", "/reservations"])("CAFETARIA → 403 sur %s", async (route) => {
      await request(app.getHttpServer())
        .get(route)
        .set("Authorization", bearer("auth-cafeteria"))
        .expect(403);
    });
  });

  describe("Produits / Stock / Cafétaria — CAFETARIA et PATRON uniquement", () => {
    const routes = ["/produits", "/stock", "/cafeteria/comptes"];

    it.each(routes)("PATRON → 200 sur %s", async (route) => {
      await request(app.getHttpServer())
        .get(route)
        .set("Authorization", bearer("auth-patron"))
        .expect(200);
    });

    it.each(routes)("CAFETARIA → 200 sur %s", async (route) => {
      await request(app.getHttpServer())
        .get(route)
        .set("Authorization", bearer("auth-cafeteria"))
        .expect(200);
    });

    it.each(routes)("RECEPTIONNISTE → 403 sur %s", async (route) => {
      await request(app.getHttpServer())
        .get(route)
        .set("Authorization", bearer("auth-receptionniste"))
        .expect(403);
    });
  });

  it("/health répond 200 sans authentification", async () => {
    await request(app.getHttpServer()).get("/health").expect(200);
  });

  describe("Dashboard — section 9.3 'Rapports/recettes' + permissions des modules sous-jacents", () => {
    it.each(["/dashboard/recette-du-jour", "/dashboard/ventes-recentes"])(
      "RECEPTIONNISTE, CAFETARIA et PATRON → 200 sur %s (chacun voit ses propres opérations)",
      async (route) => {
        for (const auth of ["auth-receptionniste", "auth-cafeteria", "auth-patron"]) {
          await request(app.getHttpServer()).get(route).set("Authorization", bearer(auth)).expect(200);
        }
      }
    );

    it("RECEPTIONNISTE et PATRON → 200 sur /dashboard/occupation, CAFETARIA → 403", async () => {
      await request(app.getHttpServer())
        .get("/dashboard/occupation")
        .set("Authorization", bearer("auth-receptionniste"))
        .expect(200);
      await request(app.getHttpServer())
        .get("/dashboard/occupation")
        .set("Authorization", bearer("auth-patron"))
        .expect(200);
      await request(app.getHttpServer())
        .get("/dashboard/occupation")
        .set("Authorization", bearer("auth-cafeteria"))
        .expect(403);
    });

    it("CAFETARIA et PATRON → 200 sur /dashboard/stock-bas, RECEPTIONNISTE → 403", async () => {
      await request(app.getHttpServer())
        .get("/dashboard/stock-bas")
        .set("Authorization", bearer("auth-cafeteria"))
        .expect(200);
      await request(app.getHttpServer())
        .get("/dashboard/stock-bas")
        .set("Authorization", bearer("auth-patron"))
        .expect(200);
      await request(app.getHttpServer())
        .get("/dashboard/stock-bas")
        .set("Authorization", bearer("auth-receptionniste"))
        .expect(403);
    });
  });

  describe("Auth — /auth/me identifie l'utilisateur connecté pour tout client", () => {
    it("refuse sans authentification", async () => {
      await request(app.getHttpServer()).get("/auth/me").expect(401);
    });

    it("retourne le rôle et le nom réels de l'utilisateur, pas ceux du jeton", async () => {
      const reponse = await request(app.getHttpServer())
        .get("/auth/me")
        .set("Authorization", bearer("auth-cafeteria"))
        .expect(200);
      expect(reponse.body).toEqual(
        expect.objectContaining({ userId: "u-cafeteria", role: "CAFETARIA", nom: "Serveur Test" })
      );
    });
  });

  describe("Public — section 9.1 : le rôle CLIENT n'a pas de compte", () => {
    it.each(["/public/chambres-disponibles", "/public/menu"])(
      "%s répond 200 SANS aucun jeton d'authentification",
      async (route) => {
        await request(app.getHttpServer()).get(route).expect(200);
      }
    );
  });

  describe("Sync — section 10.3, tous les rôles avec compte peuvent pousser/tirer", () => {
    it("refuse GET /sync/pull sans authentification", async () => {
      await request(app.getHttpServer()).get("/sync/pull?depuis=2026-01-01T00:00:00.000Z").expect(401);
    });

    it.each(["auth-receptionniste", "auth-cafeteria", "auth-patron"])(
      "%s → 200 sur GET /sync/pull",
      async (auth) => {
        await request(app.getHttpServer())
          .get("/sync/pull?depuis=2026-01-01T00:00:00.000Z")
          .set("Authorization", bearer(auth))
          .expect(200);
      }
    );

    it("un CAFETARIA reçoit une erreur d'opération (pas un 500) pour un CREATE Chambre non autorisé", async () => {
      const reponse = await request(app.getHttpServer())
        .post("/sync/push")
        .set("Authorization", bearer("auth-cafeteria"))
        .send({ operations: [{ entiteType: "Chambre", localId: "l1", operation: "CREATE", payload: {} }] })
        .expect(201);
      expect(reponse.body.resultats[0].statut).toBe("ERROR");
    });
  });
});
