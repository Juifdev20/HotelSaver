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
// La limitation de débit est coupée dans les tests ; on l'allume pour CE fichier (et on garde le CAPTCHA configuré pour vérifier qu'il bloque).
process.env.TEST_THROTTLE = "1";
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
      .useValue({ supprimerCompte: async () => undefined, mettreAJourCompte: async () => undefined, envoyerRecuperation: async () => undefined, idDepuisJeton: async () => null, motDePasseCorrect: async (_e: string, mdp: string) => mdp === "ancien-mot-de-passe" })
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

  describe("Limitation de débit, CAPTCHA, noms réservés", () => {
    it("« mot de passe oublié » est limité : la 6e demande est refusée (429)", async () => {
      const statuts: number[] = [];
      for (let i = 0; i < 7; i++) statuts.push((await http().post("/public/mot-de-passe-oublie").send({ email: `inconnu${i}@exemple.com` })).status);
      expect(statuts.slice(0, 5).every((x) => x < 400)).toBe(true);
      expect(statuts.slice(5)).toContain(429);
    });

    it("l'inscription d'un hôtel refuse un sous-domaine réservé", async () => {
      const res = await http()
        .post("/public/hotels/inscription")
        .send({ nom: "Faux", sousDomaine: "admin", nomProprietaire: "X", email: "x@exemple.com", motDePasse: "motdepasse123" });
      expect(res.status).toBe(400);
    });

    it("avec un CAPTCHA configuré, une commande/inscription sans jeton est refusée (403)", async () => {
      process.env.TURNSTILE_SECRET = "secret-de-test";
      try {
        const res = await http().post("/public/commande").send({ sousDomaine: "x", client: { nom: "A" }, lignes: [{ produitId: A.platId, quantite: 1 }] });
        expect(res.status).toBe(403);
      } finally {
        delete process.env.TURNSTILE_SECRET;
      }
    });
  });

  describe("Réservations : concurrence et acompte", () => {
    it("deux réservations simultanées sur la même chambre et les mêmes dates : une seule est acceptée", async () => {
      const corps = { chambreId: A.chambreId, client: { nom: "Course" }, dateArrivee: "2031-03-01T12:00:00.000Z", dateDepart: "2031-03-04T12:00:00.000Z" };
      const reponses = await Promise.all(Array.from({ length: 6 }, () => http().post("/reservations").set("Authorization", as(A, "recep")).send(corps)));
      const statuts = reponses.map((r) => r.status).sort();
      expect(statuts.filter((x) => x === 201)).toHaveLength(1);
      expect(statuts.filter((x) => x === 409)).toHaveLength(5);
      expect(await p.reservation.count({ where: { chambreId: A.chambreId, dateArrivee: new Date("2031-03-01T12:00:00.000Z") } })).toBe(1);
    });

    it("l'acompte ne peut pas dépasser le prix du séjour (création et modification)", async () => {
      const chambre = await p.chambre.findUnique({ where: { id: A.chambreId } });
      const prix = Number(chambre.prixParNuit);
      const trop = await http()
        .post("/reservations")
        .set("Authorization", as(A, "recep"))
        .send({ chambreId: A.chambreId, client: { nom: "Acompte" }, dateArrivee: "2032-05-01T12:00:00.000Z", dateDepart: "2032-05-03T12:00:00.000Z", acompte: prix * 2 + 1 });
      expect(trop.status).toBe(400);
      const ok = await http()
        .post("/reservations")
        .set("Authorization", as(A, "recep"))
        .send({ chambreId: A.chambreId, client: { nom: "Acompte" }, dateArrivee: "2032-05-01T12:00:00.000Z", dateDepart: "2032-05-03T12:00:00.000Z", acompte: prix });
      expect(ok.status).toBe(201);
      await http().patch(`/reservations/${ok.body.id}`).set("Authorization", as(A, "recep")).send({ acompte: prix * 5 }).expect(400);
      // Une modification d'acompte prévient le patron.
      await http().patch(`/reservations/${ok.body.id}`).set("Authorization", as(A, "recep")).send({ acompte: prix + 1 }).expect(200);
      await new Promise((r) => setTimeout(r, 300));
      const notif = await p.notification.findMany({ where: { hotelId: A.hotelId, type: "ACOMPTE_MODIFIE" } });
      expect(notif.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Sessions : un employé dont le compte change perd l'accès", () => {
    const avecSession = (authId: string, session: string) => `Bearer ${jwt.sign({ sub: authId, session_id: session }, SECRET)}`;

    it("après un changement de mot de passe par le patron, l'ancienne session est refusée, une nouvelle fonctionne", async () => {
      const ancienne = avecSession(A.auth.caf, "session-ancienne-1");
      await http().get("/auth/me").set("Authorization", ancienne).expect(200);
      await http().patch(`/utilisateurs/${A.userIds.caf}`).set("Authorization", as(A, "patron")).send({ motDePasse: "nouveau-mot-de-passe-1" }).expect(200);
      await http().get("/auth/me").set("Authorization", ancienne).expect(401);
      await http().get("/auth/me").set("Authorization", avecSession(A.auth.caf, "session-nouvelle-1")).expect(200);
    });

    it("la désactivation d'un compte coupe aussi les sessions, même après réactivation", async () => {
      const session = avecSession(A.auth.recep, "session-recep-1");
      await http().get("/auth/me").set("Authorization", session).expect(200);
      await http().patch(`/utilisateurs/${A.userIds.recep}`).set("Authorization", as(A, "patron")).send({ actif: false }).expect(200);
      await http().get("/auth/me").set("Authorization", session).expect(401);
      await http().patch(`/utilisateurs/${A.userIds.recep}`).set("Authorization", as(A, "patron")).send({ actif: true }).expect(200);
      await http().get("/auth/me").set("Authorization", session).expect(401);
    });

    it("« changer mon mot de passe » : l'ancien est vérifié, les autres sessions sont coupées, la session en cours continue", async () => {
      await p.utilisateur.update({ where: { id: A.userIds.caf }, data: { email: "caf-a@exemple.test" } });
      const courante = avecSession(A.auth.caf, "session-courante-9");
      const autre = avecSession(A.auth.caf, "session-autre-9");
      await http().get("/auth/me").set("Authorization", courante).expect(200);
      await http().get("/auth/me").set("Authorization", autre).expect(200);
      await http().post("/auth/mot-de-passe").set("Authorization", courante).send({ motDePasseActuel: "faux", nouveauMotDePasse: "nouveau-mdp-123" }).expect(401);
      await http().post("/auth/mot-de-passe").set("Authorization", courante).send({ motDePasseActuel: "ancien-mot-de-passe", nouveauMotDePasse: "court" }).expect(400);
      await http().post("/auth/mot-de-passe").set("Authorization", courante).send({ motDePasseActuel: "ancien-mot-de-passe", nouveauMotDePasse: "nouveau-mdp-123" }).expect(200);
      await http().get("/auth/me").set("Authorization", courante).expect(200);
      await http().get("/auth/me").set("Authorization", autre).expect(401);
    });

    it("une session ne peut pas servir pour un autre utilisateur", async () => {
      await http().get("/auth/me").set("Authorization", avecSession(A.auth.patron, "session-partagee")).expect(200);
      await http().get("/auth/me").set("Authorization", avecSession(B.auth.patron, "session-partagee")).expect(401);
    });
  });
});
