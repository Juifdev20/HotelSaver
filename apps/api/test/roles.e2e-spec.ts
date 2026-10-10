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

  const HOTEL_ID = "hotel-1";

  const HOTEL_ACTIF = { id: HOTEL_ID, statutLicence: "ACTIF", patronPeutOperer: false };
  // Hôtel où le patron travaille seul : il a activé « le patron peut aussi opérer ».
  const HOTEL_PATRON_OPERANT = { id: HOTEL_ID, statutLicence: "ACTIF", patronPeutOperer: true };

  const utilisateurs: Record<
    string,
    { id: string; nom: string; role: string; actif: boolean; supabaseAuthId: string; hotelId: string; hotel: typeof HOTEL_ACTIF }
  > = {
    "auth-patron": {
      id: "u-patron",
      nom: "Le Patron",
      role: "PATRON",
      actif: true,
      supabaseAuthId: "auth-patron",
      hotelId: HOTEL_ID,
      hotel: HOTEL_ACTIF,
    },
    "auth-patron-operant": {
      id: "u-patron-operant",
      nom: "Patron Opérant",
      role: "PATRON",
      actif: true,
      supabaseAuthId: "auth-patron-operant",
      hotelId: HOTEL_ID,
      hotel: HOTEL_PATRON_OPERANT,
    },
    "auth-receptionniste": {
      id: "u-receptionniste",
      nom: "Réceptionniste Test",
      role: "RECEPTIONNISTE",
      actif: true,
      supabaseAuthId: "auth-receptionniste",
      hotelId: HOTEL_ID,
      hotel: HOTEL_ACTIF,
    },
    "auth-cafeteria": {
      id: "u-cafeteria",
      nom: "Serveur Test",
      role: "CAFETARIA",
      actif: true,
      supabaseAuthId: "auth-cafeteria",
      hotelId: HOTEL_ID,
      hotel: HOTEL_ACTIF,
    },
    "auth-inactif": {
      id: "u-inactif",
      nom: "Ancien Employé",
      role: "RECEPTIONNISTE",
      actif: false,
      supabaseAuthId: "auth-inactif",
      hotelId: HOTEL_ID,
      hotel: HOTEL_ACTIF,
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
    hotel: {
      findUnique: jest.fn().mockResolvedValue(HOTEL_ACTIF),
      findFirst: jest.fn().mockResolvedValue(HOTEL_ACTIF),
    },
    chambre: { findMany: jest.fn().mockResolvedValue([]) },
    reservation: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    client: { findMany: jest.fn().mockResolvedValue([]) },
    produit: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    mouvementStock: { findMany: jest.fn().mockResolvedValue([]) },
    compteCafeteria: { findMany: jest.fn().mockResolvedValue([]) },
    sousCompte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneCommande: { findMany: jest.fn().mockResolvedValue([]) },
    facture: { findMany: jest.fn().mockResolvedValue([]) },
    venteCafeteria: { findMany: jest.fn().mockResolvedValue([]) },
    depense: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    suppression: { findMany: jest.fn().mockResolvedValue([]) },
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

    // Exception justifiée (section 9.3 "Facture séjour") : la réception lit
    // les ventes liées à un séjour pour l'aperçu de la facture — mais pas la
    // liste globale des ventes cafétaria.
    it("RECEPTIONNISTE → 403 sur /cafeteria/ventes sans filtre, 200 avec reservationLieeId", async () => {
      await request(app.getHttpServer())
        .get("/cafeteria/ventes")
        .set("Authorization", bearer("auth-receptionniste"))
        .expect(403);
      await request(app.getHttpServer())
        .get("/cafeteria/ventes?reservationLieeId=r-1")
        .set("Authorization", bearer("auth-receptionniste"))
        .expect(200);
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

  describe("Séparation des tâches — le patron ne réalise pas les opérations du quotidien", () => {
    const OPERATIONS: Array<[string, string]> = [
      ["POST", "/reservations"],
      ["PATCH", "/reservations/r1"],
      ["POST", "/reservations/r1/confirmer"],
      ["POST", "/reservations/r1/check-in"],
      ["POST", "/reservations/r1/check-out"],
      ["POST", "/factures"],
      ["POST", "/cafeteria/comptes"],
      ["POST", "/cafeteria/comptes/c1/sous-comptes"],
      ["POST", "/cafeteria/comptes/c1/lignes"],
      ["POST", "/cafeteria/comptes/c1/encaisser"],
    ];
    const appeler = (methode: string, route: string, compte: string): Promise<{ status: number; body: any }> =>
      (request(app.getHttpServer()) as any)[methode.toLowerCase()](route).set("Authorization", bearer(compte)).send({});

    it.each(OPERATIONS)("PATRON par défaut → 403 sur %s %s, avec le message de la règle", async (methode, route) => {
      const reponse = await appeler(methode, route, "auth-patron");
      expect(reponse.status).toBe(403);
      expect(reponse.body.message).toMatch(/Le patron ne réalise pas les opérations du quotidien/);
    });

    it.each(OPERATIONS)("PATRON qui a activé le réglage → jamais 403 sur %s %s (la requête atteint la validation)", async (methode, route) => {
      const reponse = await appeler(methode, route, "auth-patron-operant");
      expect(reponse.status).not.toBe(403);
      expect(reponse.status).not.toBe(401);
    });

    it("la lecture reste ouverte au patron par défaut (rapports, listes)", async () => {
      await request(app.getHttpServer()).get("/reservations").set("Authorization", bearer("auth-patron")).expect(200);
      await request(app.getHttpServer()).get("/cafeteria/comptes").set("Authorization", bearer("auth-patron")).expect(200);
    });

    it("l'annulation avec motif et l'administration restent ouvertes au patron par défaut (jamais 403)", async () => {
      for (const [methode, route] of [
        ["POST", "/reservations/r1/annuler"],
        ["POST", "/cafeteria/ventes/v1/annuler"],
        ["POST", "/produits"],
        ["POST", "/taux-change"],
      ]) {
        const reponse = await appeler(methode, route, "auth-patron");
        expect(reponse.status).not.toBe(403);
      }
    });

    it("le patron seul peut modifier le réglage ; la réception reçoit 403", async () => {
      expect((await appeler("PATCH", "/hotel/reglages", "auth-receptionniste")).status).toBe(403);
      const refus = await (request(app.getHttpServer()) as any)
        .patch("/hotel/reglages")
        .set("Authorization", bearer("auth-patron"))
        .send({ patronPeutOperer: "oui" });
      expect(refus.status).toBe(400); // validé : un booléen est exigé
    });

    it("la réception et la cafétaria font toujours leurs opérations (jamais 403)", async () => {
      expect((await appeler("POST", "/reservations/r1/check-in", "auth-receptionniste")).status).not.toBe(403);
      expect((await appeler("POST", "/cafeteria/comptes", "auth-cafeteria")).status).not.toBe(403);
    });

    it("/auth/me expose le réglage de l'hôtel pour que les apps adaptent leurs écrans", async () => {
      const defaut = await request(app.getHttpServer()).get("/auth/me").set("Authorization", bearer("auth-patron")).expect(200);
      expect(defaut.body.patronPeutOperer).toBe(false);
      const operant = await request(app.getHttpServer()).get("/auth/me").set("Authorization", bearer("auth-patron-operant")).expect(200);
      expect(operant.body.patronPeutOperer).toBe(true);
    });
  });

  describe("Produits — code-barres : la cafétaria associe, le reste de la fiche reste au patron", () => {
    it.each(["auth-cafeteria", "auth-patron"])("%s atteint le service sur PATCH /produits/:id/code-barres (404 : produit absent du mock)", async (compte) => {
      await request(app.getHttpServer())
        .patch("/produits/p1/code-barres")
        .set("Authorization", bearer(compte))
        .send({ codeBarres: "4006381333931" })
        .expect(404);
    });

    it("la réception est refusée (403) et la cafétaria ne peut pas modifier le reste de la fiche", async () => {
      await request(app.getHttpServer()).patch("/produits/p1/code-barres").set("Authorization", bearer("auth-receptionniste")).send({ codeBarres: "4006381333931" }).expect(403);
      await request(app.getHttpServer()).patch("/produits/p1").set("Authorization", bearer("auth-cafeteria")).send({ prix: 1 }).expect(403);
    });

    it("un code invalide est refusé (400)", async () => {
      await request(app.getHttpServer()).patch("/produits/p1/code-barres").set("Authorization", bearer("auth-cafeteria")).send({ codeBarres: "a b" }).expect(400);
    });
  });

  describe("Dépenses — saisies par la réception et la cafétaria, consultées par le patron", () => {
    const corps = { date: "2026-10-01", motif: "Carburant", montant: 10, devise: "USD" };

    it.each(["auth-patron", "auth-patron-operant"])("%s → 403 sur POST /depenses et PATCH /depenses/:id", async (compte) => {
      await request(app.getHttpServer()).post("/depenses").set("Authorization", bearer(compte)).send(corps).expect(403);
      await request(app.getHttpServer()).patch("/depenses/d1").set("Authorization", bearer(compte)).send({ annulee: true }).expect(403);
    });

    it.each(["auth-receptionniste", "auth-cafeteria", "auth-patron"])("%s → 200 sur GET /depenses", async (compte) => {
      await request(app.getHttpServer())
        .get("/depenses?du=2026-10-01&au=2026-10-31")
        .set("Authorization", bearer(compte))
        .expect(200);
    });

    it("la réception n'est jamais refusée en saisie (la requête atteint le service)", async () => {
      const reponse = await request(app.getHttpServer()).patch("/depenses/d1").set("Authorization", bearer("auth-receptionniste")).send({ annulee: true });
      expect(reponse.status).toBe(404); // dépense inexistante dans le mock, pas un refus de droits
    });

    it("valide le corps : un montant nul est refusé (400)", async () => {
      await request(app.getHttpServer())
        .post("/depenses")
        .set("Authorization", bearer("auth-cafeteria"))
        .send({ ...corps, montant: 0 })
        .expect(400);
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
        await request(app.getHttpServer()).get(`${route}?sousDomaine=chicago`).expect(200);
      }
    );

    it("suivi de réservation : sans jeton d'auth, un lien inconnu donne 404 (jamais 401)", async () => {
      await request(app.getHttpServer()).get("/public/suivi/inconnu?sousDomaine=chicago").expect(404);
      await request(app.getHttpServer()).post("/public/suivi/inconnu/annuler?sousDomaine=chicago").send({}).expect(404);
    });

    it("pré-enregistrement : le corps est validé (heure au format HH:MM)", async () => {
      await request(app.getHttpServer())
        .post("/public/suivi/inconnu/pre-enregistrement?sousDomaine=chicago")
        .send({ typePiece: "CNI", numeroPiece: "123456", heureArriveePrevue: "25h" })
        .expect(400);
    });
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
