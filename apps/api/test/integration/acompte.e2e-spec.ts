import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import * as jwt from "jsonwebtoken";
import { prisma } from "@hotel-chicago/database";
import { AppModule } from "../../src/app.module";
import { PaiementReservationService } from "../../src/acompte/paiement-reservation.service";
import { VERIFICATEUR_JWT, VerificateurJwtHs256 } from "../../src/common/auth/verificateur-jwt";
import { SupabaseAdminService } from "../../src/common/supabase-admin/supabase-admin.service";
import { invaliderCatalogue } from "../../src/common/abonnement/catalogue";
import { decrire, verifierBaseJetable } from "./base";
import { JeuHotel, creerHotel, uuid, viderBase } from "./donnees";
import { FauxLinkPay } from "./faux-linkpay";

const SECRET = "secret-de-test-integration";
const p = prisma as any;
const JOUR = 86_400_000;

decrire("Acompte payé en ligne sur le compte ScanLinkPay de l'hôtel, puis remboursement (vraie base)", () => {
  let app: INestApplication;
  let A: JeuHotel;
  let B: JeuHotel;
  const faux = new FauxLinkPay();

  const tok = (authId: string) => `Bearer ${jwt.sign({ sub: authId }, SECRET)}`;
  const as = (j: JeuHotel, role: "patron" | "recep" | "caf") => tok(j.auth[role]);
  const http = () => request(app.getHttpServer());
  const dateIso = (jours: number) => new Date(Date.now() + jours * JOUR).toISOString().slice(0, 10);

  /** Une demande de réservation faite par un visiteur sur le site de l'hôtel A (chambre 101 à 50 $ la nuit). */
  const demander = async (opts: { chambreId?: string; du?: number; au?: number; nom?: string } = {}) => {
    const r = await http()
      .post("/public/reservations")
      .send({ sousDomaine: "hotel-a", chambreId: opts.chambreId ?? A.chambreId, client: { nom: opts.nom ?? "Marie Kasongo", telephone: "0828497218" }, dateArrivee: dateIso(opts.du ?? 5), dateDepart: dateIso(opts.au ?? 7) })
      .expect(201);
    return { id: r.body.id as string, jeton: r.body.jetonSuivi as string };
  };
  const suivi = (jeton: string) => http().get(`/public/suivi/${jeton}`).query({ sousDomaine: "hotel-a" });
  const payer = (jeton: string, corps: object) =>
    http().post(`/public/suivi/${jeton}/paiement`).send({ sousDomaine: "hotel-a", moyen: "MOBILE_MONEY", operateur: "VODACOM", telephone: "0828497218", cleIdempotence: uuid(), ...corps });
  const lire = (jeton: string, id: string) => http().get(`/public/suivi/${jeton}/paiement/${id}`).query({ sousDomaine: "hotel-a" });
  const reservation = (id: string) => p.reservation.findUnique({ where: { id } });

  beforeAll(async () => {
    verifierBaseJetable();
    await faux.demarrer();
    process.env.LINKPAY_API_URL = faux.url;
    process.env.LINKPAY_NUMERO_MARCHAND = "SLP-TEST01";
    faux.numerosConnus.set("SLP-HOTELA", "Hôtel A SARL");
    await viderBase(prisma);
    await p.syncCorrespondance.deleteMany();
    await p.suppression.deleteMany();
    A = await creerHotel(prisma, "A");
    B = await creerHotel(prisma, "B");
    // Hôtel A : formule Pro (acompte en ligne inclus), payée. Hôtel B : Essentiel (pas d'acompte en ligne).
    for (const [j, formule] of [[A, "PRO"], [B, "ESSENTIEL"]] as const) {
      await p.paiementLicence.create({ data: { hotelId: j.hotelId, montant: 59, devise: "USD", methode: "ESPECES", periodeCouverteJusquau: new Date(Date.now() + 60 * JOUR) } });
      await p.hotel.update({ where: { id: j.hotelId }, data: { formule, statutLicence: "ACTIF" } });
    }
    await p.chambre.update({ where: { id: A.chambreId }, data: { prixParNuit: 50, devise: "USD" } });
    invaliderCatalogue();
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
    await faux.arreter();
    await viderBase(prisma);
  });

  describe("réglages du patron", () => {
    it("sans compte ScanLinkPay, pas de paiement en ligne : le site ne propose rien", async () => {
      const { jeton } = await demander();
      expect((await suivi(jeton).expect(200)).body.acompteEnLigne).toBeNull();
      await payer(jeton, {}).expect(404);
    });

    it("seul le patron y accède ; une formule sans la fonction est refusée", async () => {
      await http().get("/hotel/paiement-en-ligne").set("Authorization", as(A, "recep")).expect(403);
      const r = await http().get("/hotel/paiement-en-ligne").set("Authorization", as(B, "patron")).expect(200);
      expect(r.body).toMatchObject({ fonctionIncluse: false, serveurRelie: true, pourcentageAcompte: 0 });
      await http().patch("/hotel/paiement-en-ligne").set("Authorization", as(B, "patron")).send({ numeroScanLinkPay: "SLP-HOTELA", pourcentageAcompte: 30 }).expect(403);
    });

    it("refuse un pourcentage sans compte, un numéro introuvable, un pourcentage absurde", async () => {
      const patch = (corps: object) => http().patch("/hotel/paiement-en-ligne").set("Authorization", as(A, "patron")).send(corps);
      expect((await patch({ pourcentageAcompte: 30 }).expect(400)).body.message).toMatch(/numéro ScanLinkPay/);
      expect((await patch({ numeroScanLinkPay: "SLP-INCONNU" }).expect(400)).body.message).toMatch(/introuvable/);
      await patch({ numeroScanLinkPay: "SLP-HOTELA", pourcentageAcompte: 150 }).expect(400);
      await patch({ numeroScanLinkPay: "pas valide!" }).expect(400);
    });

    it("enregistre le compte (nom vérifié chez ScanLinkPay), le pourcentage et les conditions", async () => {
      const r = await http()
        .patch("/hotel/paiement-en-ligne")
        .set("Authorization", as(A, "patron"))
        .send({ numeroScanLinkPay: "SLP-HOTELA", pourcentageAcompte: 30, fraisPayesParClient: true, conditionsAnnulation: "Annulation gratuite jusqu'à 48 h avant l'arrivée." })
        .expect(200);
      expect(r.body).toMatchObject({ fonctionIncluse: true, numeroScanLinkPay: "SLP-HOTELA", nomScanLinkPay: "Hôtel A SARL", pourcentageAcompte: 30, fraisPayesParClient: true });
    });
  });

  describe("le client paie son acompte par Mobile Money", () => {
    let res: { id: string; jeton: string };
    let paiementId: string;

    it("la page « Ma réservation » propose 30 % du séjour : 50 $ × 2 nuits × 30 % = 30 $", async () => {
      res = await demander();
      const a = (await suivi(res.jeton).expect(200)).body.acompteEnLigne;
      expect(a).toMatchObject({ disponible: true, pourcentage: 30, devise: "USD", objectif: 30, dejaPaye: 0, reste: 30, fraisPayesParClient: true, nomMarchand: "Hôtel A SARL", moyens: { mobileMoney: true, carte: true } });
      expect(a.conditionsAnnulation).toMatch(/48 h/);
    });

    it("montre la commission ScanLinkPay AVANT de payer", async () => {
      const r = await http().get(`/public/suivi/${res.jeton}/paiement/apercu`).query({ sousDomaine: "hotel-a" }).expect(200);
      expect(r.body).toEqual({ devise: "USD", montant: 30, commission: 0.6, total: 30.6, commissionPayeePar: "PAYEUR", disponible: true });
    });

    it("refuse un opérateur qui ne correspond pas au numéro, sans rien envoyer à ScanLinkPay", async () => {
      const avant = faux.appels.length;
      await payer(res.jeton, { operateur: "AIRTEL" }).expect(400);
      await payer(res.jeton, { telephone: "12" }).expect(400);
      await payer(res.jeton, { montant: 1 }).expect(400); // jamais de montant venu du client
      expect(faux.appels.filter((a) => a.startsWith("POST")).length).toBe(faux.appels.slice(0, avant).filter((a) => a.startsWith("POST")).length);
    });

    it("lance le paiement VERS LE COMPTE DE L'HÔTEL, avec le montant du serveur et la commission à la charge du client", async () => {
      const r = await payer(res.jeton, { numeroScanLinkPay: "SLP-CLIENT1" }).expect(201);
      paiementId = r.body.id;
      expect(r.body).toMatchObject({ statut: "EN_ATTENTE", montant: 30, devise: "USD", moyen: "MOBILE_MONEY", operateur: "VODACOM", commission: 0.6, total: 30.6 });
      expect(r.body.telephoneMasque).toBe("+243 82• ••• •18");
      const lance = faux.dernier();
      expect(lance).toMatchObject({ numero: "SLP-HOTELA", montantCentimes: 3000, devise: "USD", modele: "CUSTOMER_PAID", telephone: "+243828497218", operateur: "vodacom", moyen: "mobile_money", totalCentimes: 3060 });
      expect(lance.description).toMatch(/Marie Kasongo/);
    });

    it("rejouer la même demande ne débite pas deux fois ; un second paiement est refusé tant que le premier attend", async () => {
      const avant = faux.paiements.size;
      const cle = (await p.paiementReservation.findUnique({ where: { id: paiementId } })).cleIdempotence;
      const r = await payer(res.jeton, { cleIdempotence: cle }).expect(201);
      expect(r.body.id).toBe(paiementId);
      expect(faux.paiements.size).toBe(avant);
      expect((await payer(res.jeton, {}).expect(409)).body.message).toMatch(/en attente/);
    });

    it("tant que le client n'a pas confirmé sur son téléphone, rien n'est crédité", async () => {
      expect((await lire(res.jeton, paiementId).expect(200)).body.statut).toBe("EN_ATTENTE");
      const r = await reservation(res.id);
      expect(Number(r.acompte)).toBe(0);
      expect(r.statut).toBe("EN_ATTENTE");
    });

    it("dès que ScanLinkPay confirme : acompte crédité UNE fois, réservation CONFIRMÉE, réception prévenue", async () => {
      faux.dernier().statut = "SUCCESS";
      const service = app.get(PaiementReservationService);
      await Promise.all([lire(res.jeton, paiementId), lire(res.jeton, paiementId), service.rapprocher(paiementId), service.rapprocherEnAttente()]);
      const r = await reservation(res.id);
      expect(Number(r.acompte)).toBe(30);
      expect(r.statut).toBe("CONFIRMEE");
      expect(await p.notification.count({ where: { hotelId: A.hotelId, type: "ACOMPTE_PAYE_EN_LIGNE" } })).toBe(1);
      const a = (await suivi(res.jeton).expect(200)).body;
      expect(a.statut).toBe("CONFIRMEE");
      expect(a.acompteEnLigne).toMatchObject({ disponible: false, dejaPaye: 30, reste: 0, indisponibleRaison: expect.stringMatching(/déjà payé/) });
      await payer(res.jeton, {}).expect(409);
    });

    it("la réception ET le patron voient « payé en ligne » (montant, moyen, référence) ; la cafétaria et l'autre hôtel, rien", async () => {
      for (const role of ["recep", "patron"] as const) {
        const l = (await http().get("/acomptes-en-ligne").set("Authorization", as(A, role)).expect(200)).body;
        const mien = l.find((x: any) => x.reservationId === res.id);
        expect(mien).toMatchObject({ montant: 30, devise: "USD", moyen: "MOBILE_MONEY", remboursement: null, paiementId: expect.any(String) });
        expect(mien.confirmeLe).toEqual(expect.any(String));
        expect(mien.reference).toEqual(expect.any(String));
        // Jamais le numéro de téléphone en clair.
        expect(JSON.stringify(mien)).not.toContain("0828497218");
      }
      await http().get("/acomptes-en-ligne").set("Authorization", as(A, "caf")).expect(403);
      const autre = (await http().get("/acomptes-en-ligne").set("Authorization", as(B, "patron")).expect(200)).body;
      expect(autre.some((x: any) => x.reservationId === res.id)).toBe(false);
    });
  });

  describe("carte bancaire (Visa, Mastercard)", () => {
    it("renvoie la page de paiement sécurisée du fournisseur, puis crédite à la confirmation", async () => {
      const { id, jeton } = await demander({ du: 20, au: 22, nom: "Paul Mbuyi" });
      const r = await payer(jeton, { moyen: "CARTE", operateur: undefined, telephone: undefined, email: "paul@exemple.com" }).expect(201);
      expect(r.body).toMatchObject({ statut: "EN_ATTENTE", moyen: "CARTE", operateur: null, telephoneMasque: null, urlPaiement: expect.stringMatching(/^https:\/\//) });
      expect(faux.dernier()).toMatchObject({ moyen: "card", numero: "SLP-HOTELA" });
      faux.dernier().statut = "SUCCESS";
      expect((await lire(jeton, r.body.id).expect(200)).body).toMatchObject({ statut: "REUSSI", urlPaiement: null });
      expect(Number((await reservation(id)).acompte)).toBe(30);
    });

    it("le patron peut fermer la carte (ACOMPTE_CARTE=false) sans toucher à Mobile Money", async () => {
      process.env.ACOMPTE_CARTE = "false";
      try {
        const { jeton } = await demander({ du: 30, au: 32 });
        expect((await suivi(jeton)).body.acompteEnLigne.moyens).toEqual({ mobileMoney: true, carte: false });
        await payer(jeton, { moyen: "CARTE" }).expect(400);
      } finally {
        delete process.env.ACOMPTE_CARTE;
      }
    });
  });

  describe("paiements refusés ou suspects", () => {
    it("refusé sur le téléphone → ECHEC, rien de crédité, on peut réessayer", async () => {
      const { id, jeton } = await demander({ du: 40, au: 41 });
      const r = await payer(jeton, {}).expect(201);
      faux.dernier().statut = "FAILED";
      expect((await lire(jeton, r.body.id).expect(200)).body).toMatchObject({ statut: "ECHEC", messageErreur: expect.stringMatching(/refusé|annulé/) });
      expect(Number((await reservation(id)).acompte)).toBe(0);
      await payer(jeton, {}).expect(201);
    });

    it("un « succès » du mauvais montant n'est JAMAIS crédité", async () => {
      const { id, jeton } = await demander({ du: 50, au: 51 });
      const r = await payer(jeton, {}).expect(201);
      const f = faux.dernier();
      f.statut = "SUCCESS";
      f.montantAnnonce = 100;
      expect((await lire(jeton, r.body.id).expect(200)).body).toMatchObject({ statut: "ECHEC", messageErreur: expect.stringMatching(/montant/) });
      expect(Number((await reservation(id)).acompte)).toBe(0);
    });

    it("la clé d'une autre réservation ne donne accès à rien ; un paiement d'une autre réservation est introuvable", async () => {
      const a = await demander({ du: 60, au: 61 });
      const b = await demander({ du: 62, au: 63 });
      const pa = await payer(a.jeton, {}).expect(201);
      await lire(b.jeton, pa.body.id).expect(404);
      const cle = (await p.paiementReservation.findUnique({ where: { id: pa.body.id } })).cleIdempotence;
      await payer(b.jeton, { cleIdempotence: cle }).expect(409);
    });
  });

  describe("chambre prise pendant le paiement", () => {
    it("on n'encaisse pas pour une chambre déjà confirmée ; si elle est prise PENDANT le paiement, la réservation est annulée et l'acompte placé en remboursement", async () => {
      const chambre = await p.chambre.create({ data: { hotelId: A.hotelId, numero: "301", type: "Std", prixParNuit: 40, devise: "USD" } });
      const premier = await demander({ chambreId: chambre.id, du: 70, au: 72, nom: "Premier" });
      const second = await demander({ chambreId: chambre.id, du: 71, au: 73, nom: "Second" });
      const paiement = await payer(second.jeton, {}).expect(201); // la chambre est encore libre
      // la réception confirme l'autre demande entre-temps
      await http().post(`/reservations/${premier.id}/confirmer`).set("Authorization", as(A, "recep")).expect(201);
      // désormais impossible de payer pour la seconde
      await payer(second.jeton, { cleIdempotence: uuid() }).expect(409);
      faux.dernier().statut = "SUCCESS";
      expect((await lire(second.jeton, paiement.body.id).expect(200)).body.statut).toBe("REUSSI");
      const r = await reservation(second.id);
      expect(r.statut).toBe("ANNULEE");
      expect(r.motifAnnulation).toMatch(/indisponible/);
      const remb = await p.remboursement.findFirst({ where: { reservationId: second.id } });
      expect(remb).toMatchObject({ motif: "CHAMBRE_INDISPONIBLE", statut: "A_FAIRE", clientNom: "Second" });
      expect(Number(remb.montantPaye)).toBe(24); // 40 × 2 nuits × 30 %
    });
  });

  describe("annulation et remboursement", () => {
    let res: { id: string; jeton: string };
    let rembId: string;

    it("le client annule : permis pour un acompte payé EN LIGNE, et un remboursement à décider est créé pour le patron", async () => {
      res = await demander({ du: 80, au: 82, nom: "Esther Ilunga" });
      const pay = await payer(res.jeton, { numeroScanLinkPay: "SLP-CLIENT7" }).expect(201);
      faux.dernier().statut = "SUCCESS";
      await lire(res.jeton, pay.body.id).expect(200);
      await http().post(`/public/suivi/${res.jeton}/annuler`).query({ sousDomaine: "hotel-a" }).send({ motif: "Changement de programme" }).expect(201);
      const liste = await http().get("/remboursements").set("Authorization", as(A, "patron")).expect(200);
      const r = liste.body.find((x: any) => x.reservationId === res.id);
      rembId = r.id;
      // La réception voit aussitôt que cet acompte payé en ligne attend une décision de remboursement.
      const vu = (await http().get("/acomptes-en-ligne").set("Authorization", as(A, "recep")).expect(200)).body.find((x: any) => x.reservationId === res.id);
      expect(vu.remboursement).toBe("A_FAIRE");
      expect(r).toMatchObject({ clientNom: "Esther Ilunga", statut: "A_FAIRE", motif: "ANNULATION_CLIENT", montantPaye: 30, montantARembourser: 30, destinataireScanLinkPay: "SLP-CLIENT7", destinataireTelephone: "0828497218", devise: "USD" });
      expect((await http().get("/remboursements/a-faire").set("Authorization", as(A, "patron")).expect(200)).body.nombre).toBeGreaterThanOrEqual(1);
      expect(await p.notification.count({ where: { hotelId: A.hotelId, type: "REMBOURSEMENT_A_FAIRE" } })).toBeGreaterThanOrEqual(1);
    });

    it("le client voit « remboursement en cours » sur sa page", async () => {
      const s = (await suivi(res.jeton).expect(200)).body;
      expect(s.statut).toBe("ANNULEE");
      expect(s.acompteEnLigne.remboursement).toMatchObject({ statut: "EN_COURS", montant: 30, devise: "USD" });
    });

    it("annuler deux fois ne crée pas deux remboursements", async () => {
      await http().post(`/reservations/${res.id}/annuler`).set("Authorization", as(A, "patron")).send({ motif: "doublon" }).expect(409);
      expect(await p.remboursement.count({ where: { reservationId: res.id } })).toBe(1);
    });

    it("seul le patron voit et traite les remboursements, uniquement ceux de son hôtel", async () => {
      await http().get("/remboursements").set("Authorization", as(A, "recep")).expect(403);
      await http().get("/remboursements").set("Authorization", as(A, "caf")).expect(403);
      await http().patch(`/remboursements/${rembId}`).set("Authorization", as(B, "patron")).send({ action: "CONSERVE" }).expect(404);
    });

    it("refuse de rembourser plus que le client n'a payé, ou sans dire comment", async () => {
      const patch = (corps: object) => http().patch(`/remboursements/${rembId}`).set("Authorization", as(A, "patron")).send(corps);
      expect((await patch({ action: "EFFECTUE", montant: 31, mode: "SCANLINKPAY" }).expect(400)).body.message).toMatch(/plus que/);
      expect((await patch({ action: "EFFECTUE" }).expect(400)).body.message).toMatch(/comment/);
      await patch({ action: "EFFECTUE", montant: 0, mode: "ESPECES" }).expect(400);
    });

    it("le patron rembourse (en partie, selon ses conditions) sur le compte ScanLinkPay du client ; une seule décision possible", async () => {
      const r = await http().patch(`/remboursements/${rembId}`).set("Authorization", as(A, "patron")).send({ action: "EFFECTUE", montant: 15, mode: "SCANLINKPAY", reference: "TRX-123", note: "50 % : annulation tardive" }).expect(200);
      expect(r.body).toMatchObject({ statut: "EFFECTUE", montantARembourser: 15, mode: "SCANLINKPAY", reference: "TRX-123" });
      await http().patch(`/remboursements/${rembId}`).set("Authorization", as(A, "patron")).send({ action: "CONSERVE" }).expect(409);
      expect((await suivi(res.jeton).expect(200)).body.acompteEnLigne.remboursement).toMatchObject({ statut: "EFFECTUE", montant: 15, mode: "SCANLINKPAY" });
    });

    it("le patron peut aussi CONSERVER l'acompte (non-présentation) ; l'annulation faite par la réception crée le remboursement avec le bon motif", async () => {
      const r2 = await demander({ du: 90, au: 91, nom: "Absent" });
      const pay = await payer(r2.jeton, {}).expect(201);
      faux.dernier().statut = "SUCCESS";
      await lire(r2.jeton, pay.body.id).expect(200);
      await http().post(`/reservations/${r2.id}/annuler`).set("Authorization", as(A, "recep")).send({ motif: "Client non présenté" }).expect(201);
      const remb = await p.remboursement.findFirst({ where: { reservationId: r2.id } });
      expect(remb).toMatchObject({ motif: "NON_PRESENTATION", statut: "A_FAIRE", destinataireScanLinkPay: null });
      const garde = await http().patch(`/remboursements/${remb.id}`).set("Authorization", as(A, "patron")).send({ action: "CONSERVE", note: "Conditions : non-présentation = acompte conservé" }).expect(200);
      expect(garde.body).toMatchObject({ statut: "CONSERVE", montantARembourser: 0 });
      expect((await suivi(r2.jeton).expect(200)).body.acompteEnLigne.remboursement).toMatchObject({ statut: "CONSERVE" });
    });

    it("un acompte versé en main propre (pas en ligne) ne s'annule toujours pas depuis le lien", async () => {
      const r3 = await demander({ du: 100, au: 101, nom: "Cash" });
      await p.reservation.update({ where: { id: r3.id }, data: { acompte: 10 } });
      await http().post(`/public/suivi/${r3.jeton}/annuler`).query({ sousDomaine: "hotel-a" }).send({}).expect(409);
    });
  });

  describe("chambre déjà réservée : visible « Déjà réservée », jamais réservable par un autre", () => {
    let chambre: { id: string };
    const liste = (q: object = {}) => http().get("/public/chambres-disponibles").query({ sousDomaine: "hotel-a", ...q });
    const dispo = async (q: object) => (await liste(q).expect(200)).body.find((c: any) => c.id === chambre.id)?.disponibilite;
    const demanderBrut = (du: number, au: number, nom: string) =>
      http().post("/public/reservations").send({ sousDomaine: "hotel-a", chambreId: chambre.id, client: { nom, telephone: "0828497218" }, dateArrivee: dateIso(du), dateDepart: dateIso(au) });

    it("avant tout paiement la chambre est disponible ; le site liste TOUTES les chambres avec leur statut", async () => {
      chambre = await p.chambre.create({ data: { hotelId: A.hotelId, numero: "401", type: "Suite", prixParNuit: 80, devise: "USD" } });
      const l = (await liste({ dateArrivee: dateIso(100), dateDepart: dateIso(103) }).expect(200)).body;
      expect(l.length).toBeGreaterThanOrEqual(2);
      expect(l.every((c: any) => c.disponibilite === "DISPONIBLE")).toBe(true);
      expect(JSON.stringify(l)).not.toContain(A.hotelId);
    });

    let premier: { id: string; jeton: string };
    let second: { id: string; jeton: string };
    it("pendant qu'un client PAIE (en attente de confirmation sur son téléphone), la chambre est retenue : « Réservation en cours » pour les autres", async () => {
      premier = (await demanderBrut(100, 103, "Premier client").expect(201)).body;
      premier = { id: premier.id, jeton: (premier as any).jetonSuivi };
      second = (await demanderBrut(101, 104, "Second client").expect(201)).body; // une demande simple ne bloque pas (arbitrée par la réception)
      second = { id: second.id, jeton: (second as any).jetonSuivi };
      const pay = await payer(premier.jeton, {}).expect(201);
      expect(await dispo({ dateArrivee: dateIso(101), dateDepart: dateIso(102) })).toBe("EN_COURS_DE_PAIEMENT");
      // L'autre client ne peut ni payer ni refaire une demande sur ces dates, et la page le lui dit AVANT.
      const s = (await suivi(second.jeton).expect(200)).body;
      expect(s.acompteEnLigne).toMatchObject({ disponible: false, indisponibleRaison: expect.stringMatching(/en cours de réservation par un autre client/) });
      await payer(second.jeton, {}).expect(409);
      expect((await demanderBrut(102, 103, "Troisième").expect(409)).body.message).toMatch(/en cours de réservation/);
      faux.dernier().statut = "SUCCESS";
      await lire(premier.jeton, pay.body.id).expect(200);
    });

    it("dès l'acompte payé : « Déjà réservée » sur le site, demande et paiement refusés pour les mêmes dates", async () => {
      expect((await reservation(premier.id)).statut).toBe("CONFIRMEE");
      expect(await dispo({ dateArrivee: dateIso(101), dateDepart: dateIso(102) })).toBe("RESERVEE");
      expect(await dispo({ dateArrivee: dateIso(100), dateDepart: dateIso(103) })).toBe("RESERVEE");
      // Un autre client voit la chambre « Déjà réservée » — et la page de sa demande déjà envoyée le lui dit avant qu'il ne paie.
      const refus = await demanderBrut(102, 105, "Quatrième").expect(409);
      expect(refus.body.message).toMatch(/déjà réservée/);
      const s = (await suivi(second.jeton).expect(200)).body;
      expect(s.acompteEnLigne).toMatchObject({ disponible: false, indisponibleRaison: expect.stringMatching(/vient d'être réservée par un autre client/) });
      const refusPaiement = await payer(second.jeton, {}).expect(409);
      expect(refusPaiement.body.message).toMatch(/déjà réservée/);
      expect(await p.paiementReservation.count({ where: { reservationId: second.id } })).toBe(0);
    });

    it("les jours libres restent réservables : arrivée le jour du départ de l'autre, ou dates sans rapport ", async () => {
      expect(await dispo({ dateArrivee: dateIso(103), dateDepart: dateIso(105) })).toBe("DISPONIBLE");
      expect(await dispo({ dateArrivee: dateIso(120), dateDepart: dateIso(122) })).toBe("DISPONIBLE");
      await demanderBrut(103, 105, "Départ-arrivée").expect(201);
    });

    it("sans dates : une chambre occupée aujourd'hui est « Déjà réservée » et dit à partir de quand elle est libre", async () => {
      const occupee = await p.chambre.create({ data: { hotelId: A.hotelId, numero: "402", type: "Std", prixParNuit: 30, devise: "USD" } });
      const client = await p.client.findFirst({ where: { hotelId: A.hotelId } });
      await p.reservation.create({ data: { hotelId: A.hotelId, chambreId: occupee.id, clientId: client.id, dateArrivee: new Date(Date.now() - 1 * JOUR), dateDepart: new Date(Date.now() + 2 * JOUR), statut: "EN_COURS", origine: "RECEPTION", createdBy: client.id } });
      const l = (await liste().expect(200)).body;
      const c = l.find((x: any) => x.id === occupee.id);
      expect(c.disponibilite).toBe("RESERVEE");
      expect(c.libreLe).toBe(dateIso(2));
    });
  });

  describe("la formule commande le service", () => {
    it("si la formule ne contient plus l'acompte en ligne, le site ne le propose plus et refuse le paiement", async () => {
      const { jeton } = await demander({ du: 110, au: 111 });
      expect((await suivi(jeton).expect(200)).body.acompteEnLigne).not.toBeNull();
      await p.formuleAbonnement.update({ where: { code: "PRO" }, data: { fonctions: ["RECEPTION", "CAFETERIA", "SITE_PUBLIC"] } });
      invaliderCatalogue();
      try {
        expect((await suivi(jeton).expect(200)).body.acompteEnLigne).toBeNull();
        await payer(jeton, {}).expect(404);
      } finally {
        await p.formuleAbonnement.update({ where: { code: "PRO" }, data: { fonctions: ["RECEPTION", "CAFETERIA", "SITE_PUBLIC", "ACOMPTE_EN_LIGNE"] } });
        invaliderCatalogue();
      }
    });
  });
});
