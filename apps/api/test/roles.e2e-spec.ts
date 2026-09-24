import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import * as jwt from "jsonwebtoken";
import { AppModule } from "../src/app.module";
import { PRISMA } from "../src/prisma/prisma.module";

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
  };

  const tokenPour = (supabaseAuthId: string) => jwt.sign({ sub: supabaseAuthId }, JWT_SECRET);
  const bearer = (supabaseAuthId: string) => `Bearer ${tokenPour(supabaseAuthId)}`;

  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PRISMA)
      .useValue(prismaMock)
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
});
