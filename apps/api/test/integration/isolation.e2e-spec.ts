import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import * as jwt from "jsonwebtoken";
import { prisma } from "@hotel-chicago/database";
import { AppModule } from "../../src/app.module";
import { VERIFICATEUR_JWT, VerificateurJwtHs256 } from "../../src/common/auth/verificateur-jwt";
import { SupabaseAdminService } from "../../src/common/supabase-admin/supabase-admin.service";
import { decrire, verifierBaseJetable } from "./base";
import { JeuHotel, creerHotel, instantane, marqueurs, viderBase } from "./donnees";

const SECRET = "secret-de-test-integration";
const DENIED = [400, 401, 403, 404, 409];

decrire("Isolation entre hôtels (vraie base, deux hôtels)", () => {
  let app: INestApplication;
  let A: JeuHotel;
  let B: JeuHotel;

  const tok = (authId: string) => `Bearer ${jwt.sign({ sub: authId }, SECRET)}`;
  const as = (j: JeuHotel, role: "patron" | "recep" | "caf") => tok(j.auth[role]);
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    verifierBaseJetable();
    await viderBase(prisma);
    A = await creerHotel(prisma, "A");
    B = await creerHotel(prisma, "B");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICATEUR_JWT)
      .useValue(new VerificateurJwtHs256(SECRET))
      // Jamais d'appel réseau vers Supabase pendant les tests.
      .overrideProvider(SupabaseAdminService)
      .useValue({ supprimerCompte: async () => undefined, mettreAJourCompte: async () => undefined, envoyerRecuperation: async () => undefined, idDepuisJeton: async () => null })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("Deux hôtels peuvent avoir les mêmes numéros (unicité PAR hôtel)", () => {
    it("les deux hôtels ont une chambre « 101 », un produit au même code-barres et le même numéro de reçu", () => {
      expect(A.chambreNumero).toBe(B.chambreNumero);
    });
  });

  // ------------------------------------------------------------------------------------------------ listes
  const LISTES: [string, "patron" | "recep" | "caf", boolean][] = [
    ["/chambres", "recep", true], ["/clients", "recep", true], ["/reservations", "recep", true], ["/factures", "recep", true],
    ["/produits", "caf", true], ["/stock", "caf", true], ["/stock/inventaires", "caf", true],
    ["/cafeteria/comptes", "caf", true], ["/cafeteria/ventes", "patron", true], ["/cafeteria/menu-du-jour", "caf", false],
    ["/cafeteria/cuisine", "caf", false], ["/cafeteria/produits-populaires", "caf", false],
    ["/depenses?du=2026-01-01&au=2026-12-31", "caf", true], ["/depenses?du=2026-01-01&au=2026-12-31", "recep", false], ["/rapports", "patron", true],
    ["/taux-change", "patron", true], ["/taux-change/actuel", "recep", false], ["/utilisateurs", "patron", true],
    ["/notifications", "recep", true], ["/hotel-site", "patron", false], ["/auth/me", "recep", false],
    ["/dashboard/recette-du-jour", "patron", false], ["/dashboard/recette-du-mois?mois=2026-10", "patron", false], ["/dashboard/journee-reception", "patron", false],
    ["/dashboard/occupation", "patron", false], ["/dashboard/ventes-recentes", "patron", false], ["/dashboard/stock-bas", "patron", false],
    ["/sync/pull?depuis=1970-01-01T00:00:00.000Z", "recep", true], ["/sync/pull?depuis=1970-01-01T00:00:00.000Z", "caf", true],
    ["/sync/pull?depuis=1970-01-01T00:00:00.000Z", "patron", true],
  ];

  describe("une liste ne contient jamais un identifiant de l'autre hôtel", () => {
    it.each(LISTES)("GET %s (%s)", async (route, role, controle) => {
      for (const [moi, autre] of [[A, B], [B, A]] as const) {
        const res = await http().get(route).set("Authorization", as(moi, role));
        expect(res.status).toBe(200);
        const corps = JSON.stringify(res.body);
        for (const m of marqueurs(autre)) expect(corps).not.toContain(m);
        expect(corps).not.toMatch(new RegExp(`-${autre.prefixe}["\\-]`)); // aucun nom « Table-B », « Client-B »… chez A
        if (controle) expect(corps).toContain(marqueurs(moi).find((m) => corps.includes(m)) ?? "__aucun_identifiant_de_cet_hôtel__");
      }
    });
  });

  // ------------------------------------------------------------------------------------------------ par identifiant
  type Cas = { nom: string; methode: "get" | "post" | "patch" | "put" | "delete"; chemin: (o: JeuHotel) => string; role: "patron" | "recep" | "caf"; corps?: (o: JeuHotel, moi: JeuHotel) => object };
  const j = (r: Cas["role"]) => r;
  const CAS: Cas[] = [
    { nom: "lire une chambre", methode: "get", chemin: (o) => `/chambres/${o.chambreId}`, role: j("recep") },
    { nom: "modifier une chambre", methode: "patch", chemin: (o) => `/chambres/${o.chambreId}`, role: "patron", corps: () => ({ statut: "NETTOYAGE" }) },
    { nom: "supprimer une chambre", methode: "delete", chemin: (o) => `/chambres/${o.chambreId}`, role: "patron" },
    { nom: "lire un client", methode: "get", chemin: (o) => `/clients/${o.clientId}`, role: "recep" },
    { nom: "modifier un client", methode: "patch", chemin: (o) => `/clients/${o.clientId}`, role: "recep", corps: () => ({ nom: "Piraté" }) },
    { nom: "lire une réservation", methode: "get", chemin: (o) => `/reservations/${o.reservationId}`, role: "recep" },
    { nom: "modifier une réservation", methode: "patch", chemin: (o) => `/reservations/${o.reservationId}`, role: "recep", corps: () => ({ note: "piraté" }) },
    { nom: "confirmer une réservation", methode: "post", chemin: (o) => `/reservations/${o.reservationId}/confirmer`, role: "recep" },
    { nom: "annuler une réservation", methode: "post", chemin: (o) => `/reservations/${o.reservationId}/annuler`, role: "recep", corps: () => ({ motif: "piraté" }) },
    { nom: "check-in", methode: "post", chemin: (o) => `/reservations/${o.reservationId}/check-in`, role: "recep" },
    { nom: "check-out", methode: "post", chemin: (o) => `/reservations/${o.reservationTermineeId}/check-out`, role: "recep" },
    { nom: "lire une facture", methode: "get", chemin: (o) => `/factures/${o.factureId}`, role: "recep" },
    { nom: "annuler une facture", methode: "post", chemin: (o) => `/factures/${o.factureId}/annuler`, role: "recep", corps: () => ({ motif: "piraté" }) },
    { nom: "lire un produit", methode: "get", chemin: (o) => `/produits/${o.produitId}`, role: "caf" },
    { nom: "modifier un produit", methode: "patch", chemin: (o) => `/produits/${o.produitId}`, role: "caf", corps: () => ({ prix: 999 }) },
    { nom: "code-barres d'un produit", methode: "patch", chemin: (o) => `/produits/${o.produitId}/code-barres`, role: "caf", corps: () => ({ codeBarres: "9999999999999" }) },
    { nom: "supprimer un produit", methode: "delete", chemin: (o) => `/produits/${o.produitId}`, role: "caf" },
    { nom: "lire un compte cafétaria", methode: "get", chemin: (o) => `/cafeteria/comptes/${o.compteId}`, role: "caf" },
    { nom: "compte par référence", methode: "get", chemin: (o) => `/cafeteria/comptes/par-reference/${o.compteReference}`, role: "caf" },
    { nom: "ajouter un sous-compte", methode: "post", chemin: (o) => `/cafeteria/comptes/${o.compteId}/sous-comptes`, role: "caf", corps: () => ({ nom: "Intrus" }) },
    { nom: "ajouter une ligne", methode: "post", chemin: (o) => `/cafeteria/comptes/${o.compteId}/lignes`, role: "caf", corps: (o) => ({ sousCompteId: o.sousCompteId, produitId: o.platId, quantite: 1 }) },
    { nom: "encaisser un compte", methode: "post", chemin: (o) => `/cafeteria/comptes/${o.compteId}/encaisser`, role: "caf", corps: () => ({ mode: "TOTAL", modePaiement: "CASH" }) },
    { nom: "annuler une vente", methode: "post", chemin: (o) => `/cafeteria/ventes/${o.venteId}/annuler`, role: "caf", corps: () => ({ motif: "piraté" }) },
    { nom: "statut d'une ligne", methode: "patch", chemin: (o) => `/cafeteria/lignes/${o.ligneId}/statut`, role: "caf", corps: () => ({ statut: "EN_PREPARATION" }) },
    { nom: "supprimer un item du menu", methode: "delete", chemin: (o) => `/cafeteria/menu-du-jour/items/${o.menuItemId}`, role: "caf" },
    { nom: "modifier une dépense", methode: "patch", chemin: (o) => `/depenses/${o.depenseId}`, role: "caf", corps: () => ({ motif: "piraté" }) },
    { nom: "modifier un utilisateur", methode: "patch", chemin: (o) => `/utilisateurs/${o.userIds.recep}`, role: "patron", corps: () => ({ actif: false }) },
    { nom: "marquer une notification lue", methode: "post", chemin: (o) => `/notifications/${o.notificationId}/lue`, role: "recep" },
    { nom: "télécharger un rapport", methode: "get", chemin: (o) => `/rapports/${o.rapportId}/telecharger`, role: "patron" },
    { nom: "télécharger un inventaire", methode: "get", chemin: (o) => `/stock/inventaires/${o.inventaireId}/telecharger`, role: "caf" },
    // Un identifiant de l'autre hôtel glissé dans une demande légitime (« smuggling »)
    { nom: "réserver la chambre d'un autre hôtel", methode: "post", chemin: () => `/reservations`, role: "recep", corps: (o) => ({ chambreId: o.chambreId, client: { nom: "Intrus" }, dateArrivee: "2027-01-10", dateDepart: "2027-01-12" }) },
    { nom: "réserver avec le client d'un autre hôtel", methode: "post", chemin: () => `/reservations`, role: "recep", corps: (o, moi) => ({ chambreId: moi.chambreId, clientId: o.clientId, dateArrivee: "2027-02-10", dateDepart: "2027-02-12" }) },
    { nom: "facturer la réservation d'un autre hôtel", methode: "post", chemin: () => `/factures`, role: "recep", corps: (o) => ({ reservationId: o.reservationTermineeId, modePaiement: "CASH" }) },
    { nom: "ligne avec un produit d'un autre hôtel", methode: "post", chemin: (_o) => `/cafeteria/comptes/__MOI_COMPTE__/lignes`, role: "caf", corps: (o, moi) => ({ sousCompteId: moi.sousCompteId, produitId: o.platId, quantite: 1 }) },
    { nom: "ligne dans le sous-compte d'un autre hôtel", methode: "post", chemin: (o) => `/cafeteria/comptes/__MOI_COMPTE__/lignes`, role: "caf", corps: (o, moi) => ({ sousCompteId: o.sousCompteId, produitId: moi.platId, quantite: 1 }) },
    { nom: "mouvement de stock sur un produit d'un autre hôtel", methode: "post", chemin: () => `/stock`, role: "caf", corps: (o) => ({ produitId: o.produitId, type: "ENTREE", quantite: 5 }) },
    { nom: "menu du jour avec un produit d'un autre hôtel", methode: "put", chemin: () => `/cafeteria/menu-du-jour`, role: "caf", corps: (o) => ({ items: [{ produitId: o.platId }] }) },
    { nom: "inventaire avec un produit d'un autre hôtel", methode: "post", chemin: () => `/stock/inventaires`, role: "caf", corps: (o) => ({ dateDebut: "2026-10-01", dateFin: "2026-10-02", items: [{ produitId: o.produitId, stockPhysique: 0 }] }) },
    { nom: "encaisser sur la réservation d'un autre hôtel", methode: "post", chemin: () => `/cafeteria/comptes/__MOI_COMPTE__/encaisser`, role: "caf", corps: (o) => ({ mode: "TOTAL", modePaiement: "FACTURE_CHAMBRE", reservationLieeId: o.reservationId }) },
  ];

  describe("une demande qui vise une donnée de l'autre hôtel est refusée et ne change rien", () => {
    it.each(CAS.map((c) => [c.nom, c] as const))("%s", async (_nom, cas) => {
      for (const [moi, autre] of [[A, B], [B, A]] as const) {
        const avant = await instantane(prisma, autre.hotelId);
        const chemin = cas.chemin(autre).replace("__MOI_COMPTE__", moi.compteId);
        let req = (http() as any)[cas.methode](chemin).set("Authorization", as(moi, cas.role));
        if (cas.corps) req = req.send(cas.corps(autre, moi));
        const res = await req;
        expect(DENIED).toContain(res.status);
        expect(res.status).toBeLessThan(500);
        if (res.status === 200) expect(JSON.stringify(res.body)).not.toContain(autre.hotelId);
        expect(await instantane(prisma, autre.hotelId)).toBe(avant);
      }
    });
  });

  // ------------------------------------------------------------------------------------------------ création
  describe("une création est toujours rattachée à l'hôtel de l'appelant", () => {
    it("un hotelId glissé dans le corps est ignoré ou refusé", async () => {
      const res = await http().post("/chambres").set("Authorization", as(A, "patron")).send({ numero: "777", type: "Test", prixParNuit: 10, devise: "USD", hotelId: B.hotelId });
      expect([201, 400]).toContain(res.status);
      const chez = await (prisma as any).chambre.findMany({ where: { numero: "777" } });
      for (const c of chez) expect(c.hotelId).toBe(A.hotelId);
    });

    it("chaque hôtel peut créer sa propre chambre « 303 »", async () => {
      const a = await http().post("/chambres").set("Authorization", as(A, "patron")).send({ numero: "303", type: "Test", prixParNuit: 10, devise: "USD" });
      const b = await http().post("/chambres").set("Authorization", as(B, "patron")).send({ numero: "303", type: "Test", prixParNuit: 10, devise: "USD" });
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      const doublon = await http().post("/chambres").set("Authorization", as(A, "patron")).send({ numero: "303", type: "Test", prixParNuit: 10, devise: "USD" });
      expect(doublon.status).toBe(409);
    });
  });

  // ------------------------------------------------------------------------------------------------ synchronisation
  describe("synchronisation", () => {
    it("un envoi qui modifie une donnée d'un autre hôtel est refusé et ne change rien", async () => {
      const avant = await instantane(prisma, B.hotelId);
      const res = await http().post("/sync/push").set("Authorization", as(A, "recep")).send({
        operations: [
          { entiteType: "Chambre", localId: "x1", remoteId: B.chambreId, operation: "UPDATE", payload: { statut: "NETTOYAGE" }, baseSyncVersion: 1 },
          { entiteType: "Reservation", localId: "x2", remoteId: B.reservationId, operation: "UPDATE", payload: { note: "piraté" }, baseSyncVersion: 1 },
        ],
      });
      expect(res.status).toBeLessThan(500);
      const corps = JSON.stringify(res.body);
      expect(corps).not.toContain('"status":"SYNCED"');
      expect(await instantane(prisma, B.hotelId)).toBe(avant);
    });

    it("une création envoyée avec le hotelId d'un autre hôtel est rattachée à l'appelant", async () => {
      const res = await http().post("/sync/push").set("Authorization", as(A, "caf")).send({
        operations: [{ entiteType: "Depense", localId: "dep-1", operation: "CREATE", payload: { date: "2026-10-09", motif: "Test sync", montant: 3, devise: "USD", departement: "CAFETERIA", hotelId: B.hotelId } }],
      });
      expect(res.status).toBeLessThan(500);
      const lignes = await (prisma as any).depense.findMany({ where: { motif: "Test sync" } });
      for (const l of lignes) expect(l.hotelId).toBe(A.hotelId);
    });
  });

  // ------------------------------------------------------------------------------------------------ site public
  describe("le site public d'un hôtel ne montre et ne touche que cet hôtel", () => {
    const ou = (j: JeuHotel) => `sousDomaine=hotel-${j.prefixe.toLowerCase()}`;

    it("chambres, menu et fiche ne contiennent rien de l'autre hôtel", async () => {
      for (const [moi, autre] of [[A, B], [B, A]] as const) {
        for (const route of ["/public/chambres-disponibles", "/public/menu", "/public/hotel"]) {
          const res = await http().get(`${route}?${ou(moi)}`);
          expect(res.status).toBe(200);
          const corps = JSON.stringify(res.body);
          for (const m of marqueurs(autre)) expect(corps).not.toContain(m);
          expect(corps).not.toMatch(new RegExp(`-${autre.prefixe}["\\-]|Hôtel ${autre.prefixe}`));
        }
      }
    });

    it("une demande de réservation sur le site de A avec la chambre de B est refusée", async () => {
      const avant = await instantane(prisma, B.hotelId);
      const res = await http().post("/public/reservations").send({ sousDomaine: `hotel-a`, chambreId: B.chambreId, client: { nom: "Intrus", telephone: "+243810000000" }, dateArrivee: "2027-03-10", dateDepart: "2027-03-12" });
      expect(DENIED).toContain(res.status);
      expect(await instantane(prisma, B.hotelId)).toBe(avant);
    });

    it("une commande en ligne sur le site de A avec le plat de B est refusée", async () => {
      const avant = await instantane(prisma, B.hotelId);
      const res = await http().post("/public/commande").send({ sousDomaine: "hotel-a", client: { nom: "Intrus" }, lignes: [{ produitId: B.platId, quantite: 1 }] });
      expect(DENIED).toContain(res.status);
      expect(await instantane(prisma, B.hotelId)).toBe(avant);
    });

    it("le suivi d'une réservation de B avec le site de A n'existe pas (et inversement)", async () => {
      for (const [moi, autre] of [[A, B], [B, A]] as const) {
        const res = await http().get(`/public/suivi/${autre.jetonSuivi}?${ou(moi)}`);
        expect([400, 404]).toContain(res.status);
        const annul = await http().post(`/public/suivi/${autre.jetonSuivi}/annuler?${ou(moi)}`).send({});
        expect([400, 404]).toContain(annul.status);
      }
    });

    it("le ticket d'une commande de B n'est pas téléchargeable depuis le site de A", async () => {
      const res = await http().get(`/public/commande/${B.compteId}/ticket?${ou(A)}`);
      expect([400, 404]).toContain(res.status);
    });

    it("un sous-domaine inconnu ou d'un hôtel suspendu renvoie 404", async () => {
      expect((await http().get("/public/hotel?sousDomaine=nexiste-pas")).status).toBe(404);
    });
  });

  // ------------------------------------------------------------------------------------------------ plateforme
  describe("le panneau Super-Admin est fermé aux comptes d'un hôtel", () => {
    it.each(["/super-admin/hotels"])("GET %s", async (route) => {
      for (const role of ["patron", "recep", "caf"] as const) {
        const res = await http().get(route).set("Authorization", as(A, role));
        expect([401, 403]).toContain(res.status);
      }
    });
  });

  describe("un hôtel suspendu est bloqué, l'autre continue", () => {
    it("SUSPENDU → 401 ; l'autre hôtel n'est pas touché", async () => {
      await (prisma as any).hotel.update({ where: { id: B.hotelId }, data: { statutLicence: "SUSPENDU" } });
      try {
        expect((await http().get("/chambres").set("Authorization", as(B, "recep"))).status).toBe(401);
        expect((await http().get("/chambres").set("Authorization", as(A, "recep"))).status).toBe(200);
      } finally {
        await (prisma as any).hotel.update({ where: { id: B.hotelId }, data: { statutLicence: "ACTIF" } });
      }
    });
  });
});
