import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import * as jwt from "jsonwebtoken";
import { prisma } from "@hotel-chicago/database";
import { AppModule } from "../../src/app.module";
import { VERIFICATEUR_JWT, VerificateurJwtHs256 } from "../../src/common/auth/verificateur-jwt";
import { SupabaseAdminService } from "../../src/common/supabase-admin/supabase-admin.service";
import { decrire, verifierBaseJetable } from "./base";
import { JeuHotel, creerHotel, uuid, viderBase } from "./donnees";

const SECRET = "secret-de-test-integration";
const p = prisma as any;

decrire("Sécurité : ce qu'un appareil ou un visiteur ne doit pas pouvoir faire (vraie base)", () => {
  let app: INestApplication;
  let A: JeuHotel;
  let B: JeuHotel;

  const tok = (authId: string) => `Bearer ${jwt.sign({ sub: authId }, SECRET)}`;
  const as = (j: JeuHotel, role: "patron" | "recep" | "caf") => tok(j.auth[role]);
  const http = () => request(app.getHttpServer());
  const push = (j: JeuHotel, role: "patron" | "recep" | "caf", operations: object[]) =>
    http().post("/sync/push").set("Authorization", as(j, role)).send({ operations });

  beforeAll(async () => {
    verifierBaseJetable();
    await viderBase(prisma);
    await p.syncCorrespondance.deleteMany();
    await p.suppression.deleteMany();
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
  });

  describe("/sync/push : le contenu envoyé est validé comme celui des routes HTTP", () => {
    it("une chambre ne peut pas être déplacée vers un autre hôtel (hotelId, id, syncVersion ignorés)", async () => {
      const avant = await p.chambre.findUnique({ where: { id: A.chambreId } });
      const r = await push(A, "recep", [
        { entiteType: "Chambre", localId: uuid(), remoteId: A.chambreId, operation: "UPDATE", baseSyncVersion: avant.syncVersion, payload: { statut: "OCCUPEE", hotelId: B.hotelId, id: uuid(), syncVersion: 999 } },
      ]).expect(201);
      expect(r.body.resultats[0].statut).toBe("SYNCED");
      const apres = await p.chambre.findUnique({ where: { id: A.chambreId } });
      expect(apres.hotelId).toBe(A.hotelId);
      expect(apres.statut).toBe("OCCUPEE");
      expect(apres.syncVersion).toBe(avant.syncVersion + 1);
    });

    it("une ligne de commande de quantité négative est refusée", async () => {
      const r = await push(A, "caf", [
        { entiteType: "LigneCommande", localId: uuid(), operation: "CREATE", payload: { compteId: A.compteId, sousCompteId: A.sousCompteId, produitId: A.platId, quantite: -20 } },
      ]).expect(201);
      expect(r.body.resultats[0].statut).toBe("ERROR");
      expect(r.body.resultats[0].message).toMatch(/positive/i);
    });

    it("une quantité de stock envoyée en texte est lue comme un nombre (pas de concaténation « 105 »)", async () => {
      const avant = Number((await p.produit.findUnique({ where: { id: A.produitId } })).stockActuel);
      const r = await push(A, "caf", [
        { entiteType: "MouvementStock", localId: uuid(), operation: "CREATE", payload: { produitId: A.produitId, type: "ENTREE", quantite: "5" } },
      ]).expect(201);
      expect(r.body.resultats[0].statut).toBe("SYNCED");
      const apres = Number((await p.produit.findUnique({ where: { id: A.produitId } })).stockActuel);
      expect(apres - avant).toBe(5);
    });

    it("un type de mouvement inconnu est refusé", async () => {
      const r = await push(A, "caf", [
        { entiteType: "MouvementStock", localId: uuid(), operation: "CREATE", payload: { produitId: A.produitId, type: "PIRATE", quantite: 1 } },
      ]).expect(201);
      expect(r.body.resultats[0].statut).toBe("ERROR");
    });

    it("un message d'erreur interne (Prisma) n'est jamais renvoyé à l'appareil", async () => {
      const { syncVersion } = await p.chambre.findUnique({ where: { id: A.chambreId } });
      const r = await push(A, "patron", [
        { entiteType: "Chambre", localId: uuid(), remoteId: A.chambreId, operation: "UPDATE", baseSyncVersion: syncVersion, payload: { prixParNuit: "abc" } },
      ]).expect(201);
      expect(r.body.resultats[0].statut).toBe("ERROR");
      const corps = JSON.stringify(r.body);
      expect(corps).not.toMatch(/prisma|invocation|findUnique|hotelId/i);
    });

    it("une dépense d'un autre département reste invisible, même en provoquant un conflit", async () => {
      // la dépense de test appartient à la cafétaria : la réception ne doit rien en apprendre
      const r = await push(A, "recep", [
        { entiteType: "Depense", localId: uuid(), remoteId: A.depenseId, operation: "UPDATE", baseSyncVersion: 99999, payload: { motif: "tentative" } },
      ]).expect(201);
      expect(r.body.resultats[0].statut).toBe("ERROR");
      expect(r.body.resultats[0].donneesServeur).toBeUndefined();
    });
  });

  describe("Argent", () => {
    it("une facture de séjour ne peut pas être « réglée » en FACTURE_CHAMBRE", async () => {
      await http().post("/factures").set("Authorization", as(A, "recep")).send({ reservationId: A.reservationId, modePaiement: "FACTURE_CHAMBRE" }).expect(400);
    });

    it("une consommation ne peut pas être rattachée à un séjour déjà terminé", async () => {
      const res = await http()
        .post(`/cafeteria/comptes/${A.compteId}/encaisser`)
        .set("Authorization", as(A, "caf"))
        .send({ mode: "GROUPE", modePaiement: "FACTURE_CHAMBRE", reservationLieeId: A.reservationTermineeId });
      expect([409, 400]).toContain(res.status);
    });
  });

  describe("Paramètres de requête : jamais un objet à la place d'une chaîne", () => {
    it("?reservationLieeId[startsWith]= est refusé", async () => {
      await http().get("/cafeteria/ventes?reservationLieeId[startsWith]=").set("Authorization", as(A, "patron")).expect(400);
    });
    it("?q[contains]= est refusé", async () => {
      await http().get("/clients?q[contains]=a").set("Authorization", as(A, "recep")).expect(400);
    });
    it("?limite=abc est refusé et ?limite=100000 est plafonnée", async () => {
      await http().get("/dashboard/ventes-recentes?limite=abc").set("Authorization", as(A, "patron")).expect(400);
      await http().get("/dashboard/ventes-recentes?limite=100000").set("Authorization", as(A, "patron")).expect(200);
    });
  });

  describe("Site public : rien d'interne n'est exposé", () => {
    it("les chambres publiées n'ont ni hotelId ni numéro de version", async () => {
      const sousDomaine = (await p.hotel.findUnique({ where: { id: A.hotelId } })).sousDomaine;
      const res = await http().get(`/public/chambres-disponibles?sousDomaine=${sousDomaine}`).expect(200);
      const corps = JSON.stringify(res.body);
      expect(corps).not.toContain(A.hotelId);
      expect(corps).not.toContain("syncVersion");
    });

    it("la carte publique n'expose ni prix d'achat, ni stock, ni code-barres", async () => {
      await p.produit.update({ where: { id: A.platId }, data: { commandableEnLigne: true, actif: true } });
      const sousDomaine = (await p.hotel.findUnique({ where: { id: A.hotelId } })).sousDomaine;
      const res = await http().get(`/public/menu?sousDomaine=${sousDomaine}`).expect(200);
      const corps = JSON.stringify(res.body);
      expect(corps).not.toMatch(/prixAchat|stockActuel|seuilAlerte|codeBarres|hotelId|syncVersion/);
    });
  });
});
