import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createServer, Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import * as jwt from "jsonwebtoken";
import { prisma } from "@hotel-chicago/database";
import { AppModule } from "../../src/app.module";
import { AbonnementService } from "../../src/abonnement/abonnement.service";
import { VERIFICATEUR_JWT, VerificateurJwtHs256 } from "../../src/common/auth/verificateur-jwt";
import { SupabaseAdminService } from "../../src/common/supabase-admin/supabase-admin.service";
import { decrire, verifierBaseJetable } from "./base";
import { JeuHotel, creerHotel, uuid, viderBase } from "./donnees";

const SECRET = "secret-de-test-integration";
const p = prisma as any;
const JOUR = 86_400_000;

/** Faux ScanLinkPay : mêmes routes publiques que le vrai (quick-pay, payments, payments/status), états pilotables par le test. */
interface FauxPaiement { reference: string; montantCentimes: number; devise: string; statut: "SUCCESS" | "FAILED" | "PENDING"; telephone?: string; operateur?: string; cle?: string; montantAnnonce?: number }
class FauxLinkPay {
  server!: Server;
  url = "";
  demandes = new Map<string, { reference: string; montantCentimes: number; devise: string }>();
  paiements = new Map<string, FauxPaiement>();
  parCle = new Map<string, string>();
  appels: string[] = [];
  /** Réponse forcée pour la prochaine création de paiement (ex. refus de validation de ScanLinkPay). */
  refusProchainPaiement: { statut: number; message: string; fois?: number } | null = null;
  numeroAttendu = "SLP-TEST01";

  async demarrer() {
    this.server = createServer((req, res) => {
      const morceaux: Buffer[] = [];
      req.on("data", (c) => morceaux.push(c));
      req.on("end", () => {
        const corps = morceaux.length ? JSON.parse(Buffer.concat(morceaux).toString()) : {};
        const envoyer = (code: number, json: unknown) => {
          res.writeHead(code, { "Content-Type": "application/json" });
          res.end(JSON.stringify(json));
        };
        this.appels.push(`${req.method} ${req.url}`);
        if (req.method === "POST" && req.url === "/payment-requests/quick-pay") {
          if (corps.scanlinkpay_number !== this.numeroAttendu) return envoyer(404, { message: "Organisation introuvable" });
          const token = uuid().replace(/-/g, "");
          const reference = `PR-${token.slice(0, 8)}`;
          this.demandes.set(token, { reference, montantCentimes: corps.amount_cents, devise: corps.currency });
          return envoyer(201, { reference, link_token: token, amount_cents: corps.amount_cents, currency: corps.currency, status: "CREATED" });
        }
        if (req.method === "POST" && req.url === "/payments") {
          if (this.refusProchainPaiement) {
            const r = this.refusProchainPaiement;
            if (--r.fois! <= 0) this.refusProchainPaiement = null;
            return envoyer(r.statut, { message: r.message });
          }
          const cle = String(req.headers["idempotency-key"] ?? "");
          if (!cle) return envoyer(400, { message: "Idempotency-Key header is required" });
          const existante = this.parCle.get(cle);
          if (existante) return envoyer(201, { payment_intent_id: "pi", psp_intent_id: existante, status: "PENDING", message: "Payment intent already exists (idempotent)" });
          const demande = this.demandes.get(corps.link_token);
          if (!demande) return envoyer(404, { message: "Payment request not found" });
          const reference = `FP-${uuid().slice(0, 8)}`;
          this.paiements.set(reference, { reference, montantCentimes: demande.montantCentimes, devise: demande.devise, statut: "PENDING", telephone: corps.customer_phone, operateur: corps.mobile_money_operator, cle });
          this.parCle.set(cle, reference);
          return envoyer(201, { payment_intent_id: "pi", psp_intent_id: reference, status: "PENDING" });
        }
        const m = /^\/payments\/status\/(.+)$/.exec(req.url ?? "");
        if (req.method === "GET" && m) {
          const paiement = this.paiements.get(decodeURIComponent(m[1]));
          if (!paiement) return envoyer(404, { message: "Référence de paiement introuvable" });
          return envoyer(200, { reference: paiement.reference, status: paiement.statut, amount_cents: paiement.montantAnnonce ?? paiement.montantCentimes, currency: paiement.devise });
        }
        envoyer(404, { message: "?" });
      });
    });
    await new Promise<void>((ok) => this.server.listen(0, "127.0.0.1", ok));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  dernier(): FauxPaiement {
    return [...this.paiements.values()].pop()!;
  }

  arreter() {
    return new Promise<void>((ok) => this.server.close(() => ok()));
  }
}

decrire("Abonnement : formules, paiement Mobile Money par ScanLinkPay, expiration et blocage (vraie base)", () => {
  let app: INestApplication;
  let A: JeuHotel;
  let B: JeuHotel;
  const faux = new FauxLinkPay();

  const tok = (authId: string) => `Bearer ${jwt.sign({ sub: authId }, SECRET)}`;
  const as = (j: JeuHotel, role: "patron" | "recep" | "caf") => tok(j.auth[role]);
  const http = () => request(app.getHttpServer());
  const demande = (over: object = {}) => ({ formule: "PRO", mois: 1, devise: "USD", operateur: "VODACOM", telephone: "0828497218", cleIdempotence: uuid(), ...over });
  const payer = (j: JeuHotel, corps: object) => http().post("/abonnement/paiements").set("Authorization", as(j, "patron")).send(corps);
  const lire = (j: JeuHotel, id: string) => http().get(`/abonnement/paiements/${id}`).set("Authorization", as(j, "patron"));
  const vue = (j: JeuHotel, role: "patron" | "recep" | "caf" = "patron") => http().get("/abonnement").set("Authorization", as(j, role));
  const hotel = (j: JeuHotel) => p.hotel.findUnique({ where: { id: j.hotelId } });

  /** Rend l'abonnement d'un hôtel expiré depuis `jours` jours (essai fini, jamais payé). */
  const expirer = async (j: JeuHotel, jours: number, statut = "SUSPENDU") => {
    await p.paiementAbonnement.deleteMany({ where: { hotelId: j.hotelId } });
    await p.paiementLicence.deleteMany({ where: { hotelId: j.hotelId } });
    await p.hotel.update({ where: { id: j.hotelId }, data: { createdAt: new Date(Date.now() - (14 + jours) * JOUR), statutLicence: statut, suspensionManuelle: false } });
  };

  beforeAll(async () => {
    verifierBaseJetable();
    await faux.demarrer();
    process.env.LINKPAY_API_URL = faux.url;
    process.env.LINKPAY_NUMERO_MARCHAND = "SLP-TEST01";
    process.env.ABONNEMENT_TAUX_CDF = "2800";
    await viderBase(prisma);
    await p.syncCorrespondance.deleteMany();
    await p.suppression.deleteMany();
    A = await creerHotel(prisma, "A");
    B = await creerHotel(prisma, "B");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICATEUR_JWT)
      .useValue(new VerificateurJwtHs256(SECRET))
      .overrideProvider(SupabaseAdminService)
      .useValue({ supprimerCompte: async () => undefined, mettreAJourCompte: async () => undefined, envoyerRecuperation: async () => undefined, idDepuisJeton: async () => null, motDePasseCorrect: async () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await faux.arreter();
  });

  describe("lecture", () => {
    it("le patron voit l'état (essai), les 3 formules avec leurs prix dans les deux devises, et que le paiement en ligne est disponible", async () => {
      const r = await vue(A).expect(200);
      expect(r.body.etat).toMatchObject({ statut: "ESSAI", bloque: false, renouvelable: true });
      expect(r.body.paiementEnLigne).toBe(true);
      expect(r.body.formules.map((f: any) => f.code)).toEqual(["ESSENTIEL", "PRO", "PREMIUM"]);
      const pro = r.body.formules.find((f: any) => f.code === "PRO");
      expect(pro.durees.find((d: any) => d.mois === 1)).toMatchObject({ prixUsd: 59, prixCdf: 165_500, moisOfferts: 0 });
      expect(pro.durees.find((d: any) => d.mois === 12)).toMatchObject({ prixUsd: 590, moisOfferts: 2 });
      expect(r.body.nombreChambres).toBe(2);
    });

    it("le personnel voit l'état mais ni l'historique ni le paiement en cours ; il ne peut pas payer", async () => {
      const r = await vue(A, "recep").expect(200);
      expect(r.body.etat.bloque).toBe(false);
      expect(r.body.historique).toEqual([]);
      expect(r.body.paiementEnCours).toBeNull();
      await http().post("/abonnement/paiements").set("Authorization", as(A, "recep")).send(demande()).expect(403);
      await http().post("/abonnement/paiements").set("Authorization", as(A, "caf")).send(demande()).expect(403);
    });

    it("/auth/me contient l'état d'abonnement", async () => {
      const r = await http().get("/auth/me").set("Authorization", as(A, "patron")).expect(200);
      expect(r.body.abonnement).toMatchObject({ bloque: false, renouvelable: true });
    });
  });

  describe("validation de la demande", () => {
    it("refuse formule, durée, devise, opérateur ou clé invalides", async () => {
      await payer(A, demande({ formule: "GRATUIT" })).expect(400);
      await payer(A, demande({ mois: 2 })).expect(400);
      await payer(A, demande({ devise: "EUR" })).expect(400);
      await payer(A, demande({ operateur: "MTN" })).expect(400);
      await payer(A, demande({ cleIdempotence: "pas-un-uuid" })).expect(400);
      await payer(A, demande({ montant: 1 })).expect(400); // le montant n'est JAMAIS fourni par l'application
    });

    it("refuse un numéro invalide ou d'un autre réseau que celui choisi, sans rien envoyer à ScanLinkPay", async () => {
      const avant = faux.appels.length;
      const r = await payer(A, demande({ operateur: "AIRTEL", telephone: "0828497218" })).expect(400);
      expect(r.body.message).toMatch(/M-Pesa/);
      await payer(A, demande({ telephone: "12" })).expect(400);
      expect(faux.appels.length).toBe(avant);
    });
  });

  describe("paiement réussi", () => {
    let id: string;
    let finAvant: Date;
    const cle = uuid();

    it("lance la demande chez ScanLinkPay avec le montant calculé par le serveur et le bon réseau", async () => {
      finAvant = new Date((await vue(A)).body.etat.valideJusquau);
      const r = await payer(A, demande({ cleIdempotence: cle, formule: "PRO", mois: 3, devise: "USD", operateur: "VODACOM" })).expect(201);
      id = r.body.id;
      expect(r.body).toMatchObject({ statut: "EN_ATTENTE", formule: "PRO", mois: 3, montant: 177, devise: "USD", operateur: "VODACOM", source: "EN_LIGNE" });
      expect(r.body.telephoneMasque).toBe("+243 82• ••• •18");
      expect(JSON.stringify(r.body)).not.toContain("0828497218");
      const lance = faux.dernier();
      expect(lance).toMatchObject({ montantCentimes: 17_700, devise: "USD", telephone: "+243828497218", operateur: "vodacom", cle: id });
    });

    it("rejouer la MÊME demande ne débite pas deux fois (clé d'idempotence)", async () => {
      const avant = faux.paiements.size;
      const r = await payer(A, demande({ cleIdempotence: cle, formule: "PRO", mois: 3 })).expect(201);
      expect(r.body.id).toBe(id);
      expect(faux.paiements.size).toBe(avant);
    });

    it("un second paiement est refusé tant que le premier attend la confirmation du téléphone", async () => {
      const r = await payer(A, demande()).expect(409);
      expect(r.body.message).toMatch(/en attente/);
    });

    it("la clé d'un autre hôtel ne donne accès à rien", async () => {
      await payer(B, demande({ cleIdempotence: cle })).expect(409);
      await lire(B, id).expect(404);
    });

    it("tant que le patron n'a pas confirmé sur son téléphone, rien n'est crédité", async () => {
      const r = await lire(A, id).expect(200);
      expect(r.body.paiement.statut).toBe("EN_ATTENTE");
      expect((await vue(A)).body.paiementEnCours?.id).toBe(id);
      expect(await p.paiementLicence.count({ where: { hotelId: A.hotelId } })).toBe(0);
    });

    it("dès que ScanLinkPay confirme : l'abonnement est crédité UNE seule fois, même si l'app et la tâche planifiée vérifient en même temps", async () => {
      faux.dernier().statut = "SUCCESS";
      const service = app.get(AbonnementService);
      await Promise.all([lire(A, id), lire(A, id), service.rapprocher(id), service.rapprocher(id), service.rapprocherEnAttente()]);
      const r = await lire(A, id).expect(200);
      expect(r.body.paiement).toMatchObject({ statut: "REUSSI", source: "EN_LIGNE" });
      expect(await p.paiementLicence.count({ where: { hotelId: A.hotelId } })).toBe(1);
      const licence = await p.paiementLicence.findFirst({ where: { hotelId: A.hotelId } });
      expect(licence).toMatchObject({ methode: "MOBILE_MONEY", devise: "USD", enregistreParSuperAdminId: null });
      expect(Number(licence.montant)).toBe(177);
      // payer d'avance ne fait perdre aucun jour : 3 mois de plus à partir de la fin de l'essai
      const attendu = new Date(finAvant);
      attendu.setUTCMonth(attendu.getUTCMonth() + 3);
      expect(Math.abs(licence.periodeCouverteJusquau.getTime() - attendu.getTime())).toBeLessThan(3 * JOUR); // fins de mois : écart de quelques jours au plus
      expect(r.body.etat.valideJusquau).toBe(licence.periodeCouverteJusquau.toISOString());
      expect((await hotel(A)).formule).toBe("PRO");
      expect((await hotel(A)).statutLicence).toBe("ACTIF");
    });

    it("le patron est prévenu, et l'historique garde la trace", async () => {
      expect(await p.notification.count({ where: { hotelId: A.hotelId, type: "ABONNEMENT_RENOUVELE" } })).toBe(1);
      const h = (await vue(A)).body.historique;
      expect(h[0]).toMatchObject({ id, statut: "REUSSI" });
      expect((await vue(A)).body.paiementEnCours).toBeNull();
      expect((await vue(A)).body.formuleActuelle).toBe("PRO");
    });
  });

  describe("paiement refusé ou suspect", () => {
    it("refusé / annulé sur le téléphone → ECHEC, rien n'est crédité, on peut réessayer", async () => {
      const avant = await p.paiementLicence.count({ where: { hotelId: A.hotelId } });
      const { body } = await payer(A, demande({ operateur: "AIRTEL", telephone: "0978000000" })).expect(201);
      faux.dernier().statut = "FAILED";
      const r = await lire(A, body.id).expect(200);
      expect(r.body.paiement).toMatchObject({ statut: "ECHEC" });
      expect(r.body.paiement.messageErreur).toMatch(/refusé|annulé/);
      expect(await p.paiementLicence.count({ where: { hotelId: A.hotelId } })).toBe(avant);
      await payer(A, demande()).expect(201); // plus rien n'est en attente : un nouvel essai est permis
      faux.dernier().statut = "FAILED";
      await app.get(AbonnementService).rapprocherEnAttente();
    });

    it("un « succès » dont le montant ne correspond pas n'est JAMAIS crédité", async () => {
      const avant = await p.paiementLicence.count({ where: { hotelId: A.hotelId } });
      const { body } = await payer(A, demande({ formule: "PREMIUM", mois: 1 })).expect(201);
      const f = faux.dernier();
      f.statut = "SUCCESS";
      f.montantAnnonce = 100; // 1 $ au lieu de 99 $
      const r = await lire(A, body.id).expect(200);
      expect(r.body.paiement.statut).toBe("ECHEC");
      expect(r.body.paiement.messageErreur).toMatch(/montant/i);
      expect(await p.paiementLicence.count({ where: { hotelId: A.hotelId } })).toBe(avant);
      // le support peut revérifier une fois l'incident compris : le montant reste faux, donc toujours rien
      await app.get(AbonnementService).reverifierPourSupport(body.id);
      expect(await p.paiementLicence.count({ where: { hotelId: A.hotelId } })).toBe(avant);
    });

    it("le support peut rattraper un paiement classé en échec qui a finalement abouti", async () => {
      const { body } = await payer(A, demande({ mois: 6 })).expect(201);
      const f = faux.dernier();
      f.statut = "FAILED";
      await lire(A, body.id).expect(200);
      expect((await p.paiementAbonnement.findUnique({ where: { id: body.id } })).statut).toBe("ECHEC");
      f.statut = "SUCCESS"; // le patron a finalement confirmé, en retard
      const avant = await p.paiementLicence.count({ where: { hotelId: A.hotelId } });
      const r = await app.get(AbonnementService).reverifierPourSupport(body.id);
      expect(r.statut).toBe("REUSSI");
      expect(await p.paiementLicence.count({ where: { hotelId: A.hotelId } })).toBe(avant + 1);
    });

    it("un refus de validation de ScanLinkPay (numéro…) est montré tel quel ; une panne donne un message neutre", async () => {
      faux.refusProchainPaiement = { statut: 400, message: "Numéro de téléphone invalide. Exemple : 0828 497 218.", fois: 1 };
      const r1 = await payer(A, demande()).expect(400);
      expect(r1.body.message).toMatch(/Numéro de téléphone invalide/);
      faux.refusProchainPaiement = { statut: 500, message: "Internal server error stack prisma", fois: 2 }; // l'envoi est retenté une fois ; les deux échouent
      const r2 = await payer(A, demande()).expect(503);
      expect(JSON.stringify(r2.body)).not.toMatch(/prisma|stack/i);
      const echecs = await p.paiementAbonnement.count({ where: { hotelId: A.hotelId, statut: "ECHEC" } });
      expect(echecs).toBeGreaterThanOrEqual(2);
    });
  });

  describe("hôtel dont l'abonnement a expiré", () => {
    it("pendant les 3 jours de grâce tout fonctionne encore, avec une alerte", async () => {
      await expirer(B, 2, "ACTIF");
      const r = await http().get("/chambres").set("Authorization", as(B, "recep")).expect(200);
      expect(r.body.length).toBeGreaterThan(0);
      expect((await vue(B)).body.etat).toMatchObject({ statut: "EN_GRACE", bloque: false, alerte: "GRACE" });
    });

    it("après la grâce : 402 partout, sauf le profil, l'abonnement et le paiement", async () => {
      await expirer(B, 10, "SUSPENDU");
      for (const route of ["/chambres", "/reservations", "/produits", "/dashboard/occupation"]) {
        const r = await http().get(route).set("Authorization", as(B, "patron"));
        expect([route, r.status]).toEqual([route, 402]);
        expect(r.body.code).toBe("ABONNEMENT_BLOQUE");
      }
      await http().post("/sync/push").set("Authorization", as(B, "recep")).send({ operations: [] }).expect(402);
      const moi = await http().get("/auth/me").set("Authorization", as(B, "recep")).expect(200);
      expect(moi.body.abonnement).toMatchObject({ statut: "EXPIRE", bloque: true, renouvelable: true });
      const v = await vue(B, "recep").expect(200); // le personnel comprend pourquoi
      expect(v.body.etat.bloque).toBe(true);
    });

    it("le patron paie, et l'hôtel se rouvre aussitôt — sans attendre le cron de minuit", async () => {
      const { body } = await payer(B, demande({ formule: "ESSENTIEL", mois: 1, devise: "CDF", operateur: "AIRTEL", telephone: "+243 97 800 0000" })).expect(201);
      expect(body).toMatchObject({ montant: 81_500, devise: "CDF" });
      expect(faux.dernier()).toMatchObject({ montantCentimes: 8_150_000, devise: "CDF", operateur: "airtel" });
      await http().get("/chambres").set("Authorization", as(B, "patron")).expect(402); // pas encore payé
      faux.dernier().statut = "SUCCESS";
      await lire(B, body.id).expect(200);
      await http().get("/chambres").set("Authorization", as(B, "patron")).expect(200);
      const h = await hotel(B);
      expect(h).toMatchObject({ statutLicence: "ACTIF", formule: "ESSENTIEL" });
      // expiré depuis longtemps : le mois court à partir de maintenant, pas de la vieille échéance
      const licence = await p.paiementLicence.findFirst({ where: { hotelId: B.hotelId } });
      expect(licence.periodeCouverteJusquau.getTime() - Date.now()).toBeGreaterThan(27 * JOUR);
      expect(licence.periodeCouverteJusquau.getTime() - Date.now()).toBeLessThan(32 * JOUR);
    });

    it("suspendu À LA MAIN par le support : bloqué, et le paiement en ligne est refusé (pas de réouverture par simple paiement)", async () => {
      await p.hotel.update({ where: { id: B.hotelId }, data: { statutLicence: "SUSPENDU", suspensionManuelle: true } });
      await http().get("/chambres").set("Authorization", as(B, "patron")).expect(402);
      const v = await vue(B).expect(200);
      expect(v.body.etat).toMatchObject({ statut: "SUSPENDU", renouvelable: false });
      await payer(B, demande()).expect(403);
      await p.hotel.update({ where: { id: B.hotelId }, data: { statutLicence: "ACTIF", suspensionManuelle: false } });
    });

    it("la tâche de minuit suspend les hôtels expirés (après la grâce) et pas les autres", async () => {
      await expirer(B, 10, "ACTIF");
      const { SuperAdminService } = await import("../../src/super-admin/super-admin.service");
      const n = await app.get(SuperAdminService).suspendreHotelsExpires();
      expect(n).toBe(1);
      expect(await hotel(B)).toMatchObject({ statutLicence: "SUSPENDU", suspensionManuelle: false });
      expect(await hotel(A)).toMatchObject({ statutLicence: "ACTIF" });
    });
  });

  describe("formule : plafond de chambres", () => {
    it("Essentiel est limité à 15 chambres ; un hôtel sans formule (essai) n'a pas de plafond", async () => {
      await p.hotel.update({ where: { id: A.hotelId }, data: { formule: "ESSENTIEL" } });
      for (let i = 3; i <= 15; i++) await p.chambre.create({ data: { hotelId: A.hotelId, numero: `${200 + i}`, type: "Std", prixParNuit: 40, devise: "USD" } });
      const r = await http().post("/chambres").set("Authorization", as(A, "patron")).send({ numero: "999", type: "Std", prixParNuit: 40, devise: "USD" }).expect(400);
      expect(r.body.message).toMatch(/Essentiel.*15/);
      await p.hotel.update({ where: { id: A.hotelId }, data: { formule: null } });
      await http().post("/chambres").set("Authorization", as(A, "patron")).send({ numero: "999", type: "Std", prixParNuit: 40, devise: "USD" }).expect(201);
    });

    it("on ne peut pas acheter une formule trop petite pour son nombre de chambres", async () => {
      // A compte désormais 16 chambres
      await p.paiementAbonnement.updateMany({ where: { hotelId: A.hotelId, statut: "EN_ATTENTE" }, data: { statut: "ECHEC" } });
      const r = await payer(A, demande({ formule: "ESSENTIEL" })).expect(400);
      expect(r.body.message).toMatch(/16 chambres/);
    });
  });

  describe("paiement en ligne non configuré", () => {
    it("répond 503 avec une explication, et le dit dans la vue", async () => {
      const url = process.env.LINKPAY_API_URL;
      delete process.env.LINKPAY_API_URL;
      try {
        expect((await vue(A)).body.paiementEnLigne).toBe(false);
        const r = await payer(A, demande({ formule: "PRO" })).expect(503);
        expect(r.body.message).toMatch(/support/i);
      } finally {
        process.env.LINKPAY_API_URL = url;
      }
    });
  });
});
