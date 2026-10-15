import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import * as jwt from "jsonwebtoken";
import { prisma } from "@hotel-chicago/database";
import { AppModule } from "../../src/app.module";
import { VERIFICATEUR_JWT, VerificateurJwtHs256 } from "../../src/common/auth/verificateur-jwt";
import { SupabaseAdminService } from "../../src/common/supabase-admin/supabase-admin.service";
import { invaliderCatalogue } from "../../src/common/abonnement/catalogue";
import { decrire, verifierBaseJetable } from "./base";
import { JeuHotel, creerHotel, uuid, viderBase } from "./donnees";

const SECRET = "secret-de-test-integration";
const p = prisma as any;
const JOUR = 86_400_000;

decrire("Formules définies par le super-admin, et fonctions verrouillées par l'abonnement (vraie base)", () => {
  let app: INestApplication;
  let A: JeuHotel;
  let B: JeuHotel;

  const tok = (authId: string) => `Bearer ${jwt.sign({ sub: authId }, SECRET)}`;
  const as = (j: JeuHotel, role: "patron" | "recep" | "caf") => tok(j.auth[role]);
  const admin = tok("super-admin-auth");
  const http = () => request(app.getHttpServer());
  const sa = (m: "get" | "post" | "patch" | "delete", chemin: string) => (http() as any)[m](chemin).set("Authorization", admin);

  /** Hôtel abonné à `formule` (un paiement valable encore 30 jours). */
  const abonner = async (j: JeuHotel, formule: string | null) => {
    await p.paiementLicence.deleteMany({ where: { hotelId: j.hotelId } });
    await p.paiementLicence.create({ data: { hotelId: j.hotelId, montant: 59, devise: "USD", methode: "ESPECES", periodeCouverteJusquau: new Date(Date.now() + 30 * JOUR) } });
    await p.hotel.update({ where: { id: j.hotelId }, data: { formule, statutLicence: "ACTIF" } });
  };

  beforeAll(async () => {
    verifierBaseJetable();
    await viderBase(prisma);
    await p.syncCorrespondance.deleteMany();
    await p.suppression.deleteMany();
    await p.superAdmin.create({ data: { nom: "Moi", supabaseAuthId: "super-admin-auth" } });
    A = await creerHotel(prisma, "A");
    B = await creerHotel(prisma, "B");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICATEUR_JWT)
      .useValue(new VerificateurJwtHs256(SECRET))
      .overrideProvider(SupabaseAdminService)
      .useValue({ supprimerCompte: async () => undefined, mettreAJourCompte: async () => undefined, envoyerRecuperation: async () => undefined, idDepuisJeton: async () => null })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await viderBase(prisma); // remet le catalogue de départ pour les autres fichiers
  });

  describe("administration des formules (réservée au super-admin)", () => {
    it("ni un patron ni un visiteur n'y accèdent", async () => {
      await http().get("/super-admin/formules").expect(401);
      await http().get("/super-admin/formules").set("Authorization", as(A, "patron")).expect(401);
      await http().patch("/super-admin/parametres-abonnement").set("Authorization", as(A, "patron")).send({ tauxCdf: 1000 }).expect(401);
    });

    it("liste les trois formules de départ avec leurs fonctions", async () => {
      const r = await sa("get", "/super-admin/formules").expect(200);
      expect(r.body.map((f: any) => f.code)).toEqual(["ESSENTIEL", "PRO", "PREMIUM"]);
      expect(r.body[0]).toMatchObject({ prixMensuelUsd: 29, maxChambres: 15, fonctions: ["RECEPTION"] });
      expect(r.body[2]).toMatchObject({ maxChambres: null, hotelsAbonnes: 0 });
    });

    it("crée une formule ; le patron la voit aussitôt avec ses prix dans les deux devises", async () => {
      await sa("post", "/super-admin/formules")
        .send({ code: "PETIT", nom: "Petit", prixMensuelUsd: 12.5, maxChambres: 6, fonctions: ["RECEPTION", "CAFETERIA"], avantages: ["Support par WhatsApp"] })
        .expect(201);
      const v = await http().get("/abonnement").set("Authorization", as(A, "patron")).expect(200);
      const petit = v.body.formules.find((f: any) => f.code === "PETIT");
      expect(petit).toMatchObject({ nom: "Petit", prixMensuelUsd: 12.5, maxChambres: 6, fonctions: ["RECEPTION", "CAFETERIA"] });
      expect(petit.durees.find((d: any) => d.mois === 1)).toMatchObject({ prixUsd: 12.5, prixCdf: 35_000 });
      expect(petit.inclus).toEqual(expect.arrayContaining(["Jusqu'à 6 chambres", "Support par WhatsApp"]));
    });

    it("refuse un code invalide, un doublon, un prix absurde, une fonction inconnue, aucune fonction", async () => {
      const base = { nom: "X", prixMensuelUsd: 10, fonctions: ["RECEPTION"] };
      await sa("post", "/super-admin/formules").send({ ...base, code: "minuscules" }).expect(400);
      await sa("post", "/super-admin/formules").send({ ...base, code: "PETIT" }).expect(409);
      await sa("post", "/super-admin/formules").send({ ...base, code: "GRATUIT", prixMensuelUsd: 0 }).expect(400);
      await sa("post", "/super-admin/formules").send({ ...base, code: "BIZARRE", fonctions: ["VOL_DE_DONNEES"] }).expect(400);
      await sa("post", "/super-admin/formules").send({ ...base, code: "VIDE", fonctions: [] }).expect(400);
    });

    it("changer un prix s'applique tout de suite à ce que voit le patron, mais ne touche pas une période déjà payée", async () => {
      await abonner(A, "PRO");
      const finAvant = (await p.paiementLicence.findFirst({ where: { hotelId: A.hotelId } })).periodeCouverteJusquau.getTime();
      await sa("patch", "/super-admin/formules/PRO").send({ prixMensuelUsd: 75 }).expect(200);
      const v = await http().get("/abonnement").set("Authorization", as(A, "patron")).expect(200);
      expect(v.body.formules.find((f: any) => f.code === "PRO").prixMensuelUsd).toBe(75);
      expect((await p.paiementLicence.findFirst({ where: { hotelId: A.hotelId } })).periodeCouverteJusquau.getTime()).toBe(finAvant);
      await sa("patch", "/super-admin/formules/PRO").send({ prixMensuelUsd: 59 }).expect(200);
    });

    it("une seule formule « recommandée » à la fois", async () => {
      await sa("patch", "/super-admin/formules/PREMIUM").send({ recommandee: true }).expect(200);
      const r = await sa("get", "/super-admin/formules").expect(200);
      expect(r.body.filter((f: any) => f.recommandee).map((f: any) => f.code)).toEqual(["PREMIUM"]);
    });

    it("désactiver une formule la retire de la vente SANS toucher ceux qui l'ont ; on ne peut plus l'acheter", async () => {
      await sa("patch", "/super-admin/formules/PETIT").send({ actif: false }).expect(200);
      const v = await http().get("/abonnement").set("Authorization", as(A, "patron")).expect(200);
      expect(v.body.formules.map((f: any) => f.code)).not.toContain("PETIT");
    });

    it("on ne supprime pas une formule utilisée ; on supprime une formule inutilisée ; on garde toujours une formule en vente", async () => {
      const r = await sa("delete", "/super-admin/formules/PRO").expect(409); // hôtel A l'a
      expect(r.body.message).toMatch(/désactivez/);
      await sa("delete", "/super-admin/formules/PETIT").expect(200);
      await sa("patch", "/super-admin/formules/ESSENTIEL").send({ actif: false }).expect(200);
      await sa("patch", "/super-admin/formules/PREMIUM").send({ actif: false }).expect(200);
      const dernier = await sa("patch", "/super-admin/formules/PRO").send({ actif: false }).expect(400);
      expect(dernier.body.message).toMatch(/au moins une formule/);
      await sa("patch", "/super-admin/formules/ESSENTIEL").send({ actif: true }).expect(200);
      await sa("patch", "/super-admin/formules/PREMIUM").send({ actif: true }).expect(200);
    });
  });

  describe("réglages de la plateforme", () => {
    it("le taux en francs et les mois offerts de l'année changent les prix affichés ET facturés", async () => {
      await sa("patch", "/super-admin/parametres-abonnement").send({ tauxCdf: 3000, moisOffertsAnnuel: 3 }).expect(200);
      const v = await http().get("/abonnement").set("Authorization", as(A, "patron")).expect(200);
      const pro = v.body.formules.find((f: any) => f.code === "PRO");
      expect(pro.durees.find((d: any) => d.mois === 1).prixCdf).toBe(177_000); // 59 × 3000
      expect(pro.durees.find((d: any) => d.mois === 12)).toMatchObject({ moisOfferts: 3, prixUsd: 531 }); // 9 mois payés
      expect(v.body.contactSupport).toEqual({ telephone: "+243828497218", whatsapp: "+243828497218" });
      await sa("patch", "/super-admin/parametres-abonnement").send({ tauxCdf: 2800, moisOffertsAnnuel: 2 }).expect(200);
    });

    it("refuse un taux ou une durée absurdes", async () => {
      await sa("patch", "/super-admin/parametres-abonnement").send({ tauxCdf: 10 }).expect(400);
      await sa("patch", "/super-admin/parametres-abonnement").send({ moisOffertsAnnuel: 11 }).expect(400);
      await sa("patch", "/super-admin/parametres-abonnement").send({ contactTelephone: "abc" }).expect(400);
    });

    it("la durée de l'essai est réglable", async () => {
      await p.hotel.update({ where: { id: B.hotelId }, data: { createdAt: new Date(Date.now() - 20 * JOUR), formule: null, statutLicence: "ESSAI" } });
      await p.paiementLicence.deleteMany({ where: { hotelId: B.hotelId } });
      expect((await http().get("/abonnement").set("Authorization", as(B, "patron")).expect(200)).body.etat).toMatchObject({ statut: "EXPIRE", bloque: true }); // 20 j > 14 + 3 j de grâce
      await sa("patch", "/super-admin/parametres-abonnement").send({ joursEssai: 30 }).expect(200);
      expect((await http().get("/abonnement").set("Authorization", as(B, "patron")).expect(200)).body.etat).toMatchObject({ statut: "ESSAI", bloque: false });
      await sa("patch", "/super-admin/parametres-abonnement").send({ joursEssai: 14 }).expect(200);
    });
  });

  describe("fonctions verrouillées par la formule", () => {
    it("pendant l'essai tout est ouvert", async () => {
      await p.hotel.update({ where: { id: B.hotelId }, data: { createdAt: new Date(), formule: null, statutLicence: "ESSAI" } });
      await http().get("/produits").set("Authorization", as(B, "caf")).expect(200);
      await http().get("/chambres").set("Authorization", as(B, "recep")).expect(200);
    });

    it("Essentiel = réception seulement : la cafétaria répond 403 FONCTION_NON_INCLUSE avec un message qui dit quoi faire", async () => {
      await abonner(A, "ESSENTIEL");
      await http().get("/chambres").set("Authorization", as(A, "recep")).expect(200);
      for (const route of ["/produits", "/stock", "/cafeteria/comptes"]) {
        const r = await http().get(route).set("Authorization", as(A, "caf"));
        expect([route, r.status, r.body.code]).toEqual([route, 403, "FONCTION_NON_INCLUSE"]);
      }
      const r = await http().get("/produits").set("Authorization", as(A, "patron")).expect(403);
      expect(r.body.message).toMatch(/Paramètres → Abonnement/);
      await http().get("/hotel-site").set("Authorization", as(A, "patron")).expect(403); // site public non inclus
    });

    it("le profil annonce les fonctions ouvertes (les applications masquent le reste)", async () => {
      const moi = await http().get("/auth/me").set("Authorization", as(A, "patron")).expect(200);
      expect(moi.body.fonctions).toEqual(["RECEPTION"]);
      const v = await http().get("/abonnement").set("Authorization", as(A, "patron")).expect(200);
      expect(v.body.fonctions).toEqual(["RECEPTION"]);
    });

    it("la synchronisation suit : rien de la cafétaria n'est envoyé, rien n'y est accepté", async () => {
      const pull = await http().get("/sync/pull").query({ depuis: "2020-01-01T00:00:00.000Z" }).set("Authorization", as(A, "patron")).expect(200);
      expect(Object.keys(pull.body.donnees ?? pull.body.entites ?? pull.body)).not.toContain("Produit");
      expect(JSON.stringify(pull.body)).not.toContain(A.platId);
      const push = await http()
        .post("/sync/push")
        .set("Authorization", as(A, "caf"))
        .send({ operations: [{ entiteType: "MouvementStock", localId: uuid(), operation: "CREATE", payload: { produitId: A.produitId, type: "ENTREE", quantite: 5 } }] })
        .expect(201);
      expect(push.body.resultats[0].statut).toBe("ERROR");
      expect(push.body.resultats[0].message).toMatch(/pas incluse/);
    });

    it("le site public suit la formule : sans SITE_PUBLIC, 404 comme un hôtel inconnu ; avec, il s'ouvre", async () => {
      await http().get("/public/hotel").query({ sousDomaine: "hotel-a" }).expect(404);
      await http().get("/public/chambres-disponibles").query({ sousDomaine: "hotel-a" }).expect(404);
      await sa("patch", `/super-admin/hotels/${A.hotelId}/formule`).send({ formule: "PRO" }).expect(200);
      await http().get("/public/hotel").query({ sousDomaine: "hotel-a" }).expect(200);
      await http().get("/public/chambres-disponibles").query({ sousDomaine: "hotel-a" }).expect(200);
      await http().get("/produits").set("Authorization", as(A, "caf")).expect(200);
    });

    it("le menu en ligne exige la cafétaria ; le domaine personnalisé exige DOMAINE_PERSONNALISE", async () => {
      await sa("patch", "/super-admin/formules/PRO").send({ fonctions: ["RECEPTION", "SITE_PUBLIC"] }).expect(200);
      await http().get("/public/menu").query({ sousDomaine: "hotel-a" }).expect(404);
      const r = await sa("post", `/super-admin/hotels/${A.hotelId}/domaine`).send({ domaine: "www.hotel-a.com" }).expect(400);
      expect(r.body.message).toMatch(/n'inclut pas le domaine/);
      await sa("patch", "/super-admin/formules/PRO").send({ fonctions: ["RECEPTION", "CAFETERIA", "SITE_PUBLIC", "ACOMPTE_EN_LIGNE"] }).expect(200);
      await http().get("/public/menu").query({ sousDomaine: "hotel-a" }).expect(200);
    });

    it("la page des tarifs du site lit les formules du super-admin", async () => {
      await sa("patch", "/super-admin/formules/ESSENTIEL").send({ prixMensuelUsd: 31 }).expect(200);
      const r = await http().get("/public/formules").expect(200);
      expect(r.body.formules.find((f: any) => f.code === "ESSENTIEL").prixMensuelUsd).toBe(31);
      expect(r.body.parametres).toMatchObject({ joursEssai: 14, joursGrace: 3 });
      expect(r.body.contact.whatsapp).toBe("+243828497218");
    });
  });
});
