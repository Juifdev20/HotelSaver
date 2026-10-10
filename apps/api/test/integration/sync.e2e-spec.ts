import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import * as jwt from "jsonwebtoken";
import { prisma } from "@hotel-chicago/database";
import { AppModule } from "../../src/app.module";
import { VERIFICATEUR_JWT, VerificateurJwtHs256 } from "../../src/common/auth/verificateur-jwt";
import { SupabaseAdminService } from "../../src/common/supabase-admin/supabase-admin.service";
import { decrire, verifierBaseJetable } from "./base";
import { JeuHotel, creerHotel, instantane, uuid, viderBase } from "./donnees";

const SECRET = "secret-de-test-integration";
const p = prisma as any;

decrire("Synchronisation : doublons, reprises, pagination, suppressions (vraie base)", () => {
  let app: INestApplication;
  let A: JeuHotel;
  let B: JeuHotel;

  const tok = (authId: string) => `Bearer ${jwt.sign({ sub: authId }, SECRET)}`;
  const as = (j: JeuHotel, role: "patron" | "recep" | "caf") => tok(j.auth[role]);
  const http = () => request(app.getHttpServer());
  const push = (j: JeuHotel, role: "patron" | "recep" | "caf", operations: object[]) =>
    http().post("/sync/push").set("Authorization", as(j, role)).send({ operations });
  const pull = (j: JeuHotel, role: "patron" | "recep" | "caf", requete = "depuis=1970-01-01T00:00:00.000Z") =>
    http().get(`/sync/pull?${requete}`).set("Authorization", as(j, role));

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

  describe("CREATE rejoué ou en double : une seule ligne", () => {
    it("le même envoi deux fois crée UNE chambre et renvoie le même remoteId", async () => {
      const op = { entiteType: "Chambre", localId: uuid(), operation: "CREATE", payload: { numero: "R-1", type: "Std", prixParNuit: 40, devise: "USD" } };
      const r1 = await push(A, "patron", [op]).expect(201);
      const r2 = await push(A, "patron", [op]).expect(201);
      expect(r1.body.resultats[0].statut).toBe("SYNCED");
      expect(r2.body.resultats[0]).toMatchObject({ statut: "SYNCED", remoteId: r1.body.resultats[0].remoteId });
      expect(await p.chambre.count({ where: { hotelId: A.hotelId, numero: "R-1" } })).toBe(1);
      expect(typeof r1.body.serveurLe).toBe("string");
    });

    it("dix envois simultanés du même mouvement de stock : le stock n'est modifié qu'UNE fois", async () => {
      const avant = (await p.produit.findUnique({ where: { id: A.produitId } })).stockActuel;
      const op = { entiteType: "MouvementStock", localId: uuid(), operation: "CREATE", payload: { produitId: A.produitId, type: "ENTREE", quantite: 5 } };
      const reponses = await Promise.all(Array.from({ length: 10 }, () => push(A, "caf", [op])));
      for (const r of reponses) expect(r.status).toBe(201);
      const statuts = reponses.map((r) => r.body.resultats[0]);
      expect(statuts.filter((s) => s.statut === "SYNCED").length).toBeGreaterThanOrEqual(1);
      // les autres sont soit rejouées (SYNCED, même remoteId) soit « déjà en cours » (temporaire)
      for (const s of statuts) if (s.statut === "ERROR") expect(s.temporaire).toBe(true);
      const apres = (await p.produit.findUnique({ where: { id: A.produitId } })).stockActuel;
      expect(Number(apres) - Number(avant)).toBe(5);
      const remoteIds = new Set(statuts.filter((s) => s.statut === "SYNCED").map((s) => s.remoteId));
      expect(remoteIds.size).toBe(1);
    });

    it("le même localId dans deux hôtels donne deux lignes distinctes, sans mélange", async () => {
      const localId = uuid();
      const op = { entiteType: "Chambre", localId, operation: "CREATE", payload: { numero: "SAME", type: "Std", prixParNuit: 10, devise: "USD" } };
      const ra = await push(A, "patron", [op]).expect(201);
      const rb = await push(B, "patron", [op]).expect(201);
      expect(ra.body.resultats[0].remoteId).not.toBe(rb.body.resultats[0].remoteId);
      expect((await p.chambre.findUnique({ where: { id: ra.body.resultats[0].remoteId } })).hotelId).toBe(A.hotelId);
      expect((await p.chambre.findUnique({ where: { id: rb.body.resultats[0].remoteId } })).hotelId).toBe(B.hotelId);
    });

    it("un CREATE refusé par une règle métier libère la clé : un nouvel essai corrigé peut réussir", async () => {
      const localId = uuid();
      const mauvais = { entiteType: "Chambre", localId, operation: "CREATE", payload: { numero: "101", type: "Std", prixParNuit: 10, devise: "USD" } }; // 101 existe déjà
      const r1 = await push(A, "patron", [mauvais]).expect(201);
      expect(r1.body.resultats[0].statut).toBe("ERROR");
      expect(r1.body.resultats[0].temporaire).toBeFalsy();
      const bon = { ...mauvais, payload: { ...mauvais.payload, numero: "R-OK" } };
      const r2 = await push(A, "patron", [bon]).expect(201);
      expect(r2.body.resultats[0].statut).toBe("SYNCED");
    });
  });

  describe("UPDATE rejoué : pas de faux conflit ; vrai conflit : le serveur gagne", () => {
    it("rejouer une modification déjà appliquée renvoie SYNCED, pas CONFLICT", async () => {
      const c = await p.chambre.findUnique({ where: { id: A.chambreId } });
      const op = { entiteType: "Chambre", localId: uuid(), operation: "UPDATE", remoteId: A.chambreId, baseSyncVersion: c.syncVersion, payload: { statut: "NETTOYAGE" } };
      const r1 = await push(A, "recep", [op]).expect(201);
      const r2 = await push(A, "recep", [op]).expect(201);
      expect(r1.body.resultats[0].statut).toBe("SYNCED");
      expect(r2.body.resultats[0].statut).toBe("SYNCED");
    });

    it("une vraie modification concurrente reste un CONFLICT et ne change rien", async () => {
      const c = await p.chambre.findUnique({ where: { id: A.chambreId } });
      const op = { entiteType: "Chambre", localId: uuid(), operation: "UPDATE", remoteId: A.chambreId, baseSyncVersion: c.syncVersion - 1, payload: { statut: "OCCUPEE" } };
      const r = await push(A, "recep", [op]).expect(201);
      expect(r.body.resultats[0].statut).toBe("CONFLICT");
      expect((await p.chambre.findUnique({ where: { id: A.chambreId } })).statut).toBe("NETTOYAGE");
    });

    it("modifier la chambre d'un autre hôtel est refusé, aucune donnée de B ne change", async () => {
      const avant = await instantane(prisma, B.hotelId);
      const op = { entiteType: "Chambre", localId: uuid(), operation: "UPDATE", remoteId: B.chambreId, baseSyncVersion: 1, payload: { statut: "OCCUPEE" } };
      const r = await push(A, "recep", [op]).expect(201);
      expect(r.body.resultats[0].statut).toBe("ERROR");
      expect(await instantane(prisma, B.hotelId)).toBe(avant);
    });
  });

  describe("pull : curseur serveur, pagination, pierres tombales", () => {
    it("renvoie _meta.serveurLe, _meta.curseur et rien de l'autre hôtel", async () => {
      const r = await pull(A, "patron").expect(200);
      expect(r.body._meta.tronque).toEqual([]);
      expect(Math.abs(Date.parse(r.body._meta.serveurLe) - Date.now())).toBeLessThan(10_000);
      expect(Date.parse(r.body._meta.curseur)).toBeLessThan(Date.parse(r.body._meta.serveurLe));
      expect(JSON.stringify(r.body)).not.toContain(B.chambreId);
    });

    it("limite=2 : page pleine signalée dans _meta.tronque, et le reste se récupère en reprenant au dernier updatedAt", async () => {
      for (let i = 0; i < 5; i++) await p.chambre.create({ data: { hotelId: A.hotelId, numero: `PAG-${i}`, type: "Std", prixParNuit: 1, devise: "USD" } });
      const total = await p.chambre.count({ where: { hotelId: A.hotelId } });
      const vus = new Set<string>();
      let depuis = "1970-01-01T00:00:00.000Z";
      for (let tour = 0; tour < 50; tour++) {
        const r = await pull(A, "patron", `depuis=${encodeURIComponent(depuis)}&entites=Chambre&limite=2`).expect(200);
        const lignes = r.body.Chambre as { id: string; updatedAt: string }[];
        lignes.forEach((l) => vus.add(l.id));
        if (!r.body._meta.tronque.includes("Chambre")) break;
        depuis = lignes[lignes.length - 1].updatedAt;
      }
      expect(vus.size).toBe(total);
    });

    it("supprimer une chambre laisse une pierre tombale visible de SON hôtel seulement", async () => {
      const c = await p.chambre.create({ data: { hotelId: A.hotelId, numero: "A-SUPPR", type: "Std", prixParNuit: 1, devise: "USD" } });
      await http().delete(`/chambres/${c.id}`).set("Authorization", as(A, "patron")).expect((r) => expect([200, 204]).toContain(r.status));
      const chezA = await pull(A, "patron", "depuis=1970-01-01T00:00:00.000Z").expect(200);
      expect(chezA.body._meta.suppressions).toEqual(expect.arrayContaining([expect.objectContaining({ entiteType: "Chambre", id: c.id })]));
      const chezB = await pull(B, "patron").expect(200);
      expect(JSON.stringify(chezB.body._meta.suppressions)).not.toContain(c.id);
    });

    it("un rôle ne reçoit pas les pierres tombales des types qu'il ne lit pas", async () => {
      const produit = await p.produit.create({ data: { hotelId: A.hotelId, nom: "Jetable", categorie: "X", prix: 1, devise: "USD" } });
      await http().delete(`/produits/${produit.id}`).set("Authorization", as(A, "patron")).expect((r) => expect([200, 204]).toContain(r.status));
      const recep = await pull(A, "recep").expect(200);
      expect(JSON.stringify(recep.body._meta.suppressions)).not.toContain(produit.id);
      const caf = await pull(A, "caf").expect(200);
      expect(JSON.stringify(caf.body._meta.suppressions)).toContain(produit.id);
    });

    it("un hôtel supprimé... ne laisse pas de pierre tombale : une suppression refusée (FK) n'en crée pas", async () => {
      const avant = await p.suppression.count({ where: { hotelId: A.hotelId } });
      await http().delete(`/chambres/${A.chambreId}`).set("Authorization", as(A, "patron")).expect(409);
      expect(await p.suppression.count({ where: { hotelId: A.hotelId } })).toBe(avant);
    });
  });

  describe("horodatage fourni par l'appareil : borné", () => {
    const mouvement = (horodatageClient: string) => ({
      entiteType: "MouvementStock", localId: uuid(), operation: "CREATE", horodatageClient,
      payload: { produitId: A.produitId, type: "ENTREE", quantite: 1 },
    });

    it("une date récente de l'appareil est conservée", async () => {
      const voulu = new Date(Date.now() - 3 * 3_600_000);
      const r = await push(A, "caf", [mouvement(voulu.toISOString())]).expect(201);
      const m = await p.mouvementStock.findUnique({ where: { id: r.body.resultats[0].remoteId } });
      expect(Math.abs(m.createdAt.getTime() - voulu.getTime())).toBeLessThan(1000);
    });

    it("une date dans le futur est ramenée à maintenant", async () => {
      const r = await push(A, "caf", [mouvement(new Date(Date.now() + 10 * 86_400_000).toISOString())]).expect(201);
      const m = await p.mouvementStock.findUnique({ where: { id: r.body.resultats[0].remoteId } });
      expect(m.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(m.createdAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    });

    it("une date de 2001 est ramenée à 30 jours au plus", async () => {
      const r = await push(A, "caf", [mouvement("2001-01-01T00:00:00.000Z")]).expect(201);
      const m = await p.mouvementStock.findUnique({ where: { id: r.body.resultats[0].remoteId } });
      expect(m.createdAt.getTime()).toBeGreaterThanOrEqual(Date.now() - 30 * 86_400_000 - 5000);
    });
  });

  describe("charges forgées : hotelId / id dans le payload ne changent jamais l'hôtel de destination", () => {
    const FORGE = { hotelId: "", id: "", createdBy: "", ouvertPar: "" };
    const CREATIONS: [string, "patron" | "recep" | "caf", (j: JeuHotel) => object][] = [
      ["Chambre", "patron", () => ({ numero: "FORGE-C", type: "Std", prixParNuit: 1, devise: "USD" })],
      ["Produit", "patron", () => ({ nom: "Forgé", categorie: "X", prix: 1, devise: "USD" })],
      ["MouvementStock", "caf", (j) => ({ produitId: j.produitId, type: "ENTREE", quantite: 1 })],
      ["CompteCafeteria", "caf", () => ({ tableOuNom: "Forgée" })],
      ["Depense", "caf", () => ({ date: "2026-10-01", motif: "Forgé", montant: 1, devise: "USD" })],
    ];
    it.each(CREATIONS)("%s", async (entiteType, role, payload) => {
      const avantB = await instantane(prisma, B.hotelId);
      const forge = { ...FORGE, hotelId: B.hotelId, id: uuid(), createdBy: B.userIds.caf, ouvertPar: B.userIds.caf };
      const r = await push(A, role, [{ entiteType, localId: uuid(), operation: "CREATE", payload: { ...payload(A), ...forge } }]).expect(201);
      const res = r.body.resultats[0];
      if (res.statut === "SYNCED") {
        const acc = { Chambre: "chambre", Produit: "produit", MouvementStock: "mouvementStock", CompteCafeteria: "compteCafeteria", Depense: "depense" }[entiteType]!;
        expect((await p[acc].findUnique({ where: { id: res.remoteId } })).hotelId).toBe(A.hotelId);
      }
      expect(await instantane(prisma, B.hotelId)).toBe(avantB);
    });

    it("référencer le produit ou le compte d'un autre hôtel est refusé sans fuite", async () => {
      const avantB = await instantane(prisma, B.hotelId);
      const r = await push(A, "caf", [
        { entiteType: "MouvementStock", localId: uuid(), operation: "CREATE", payload: { produitId: B.produitId, type: "SORTIE", quantite: 1 } },
        { entiteType: "LigneCommande", localId: uuid(), operation: "CREATE", payload: { compteId: B.compteId, sousCompteId: B.sousCompteId, produitId: B.platId, quantite: 1 } },
        { entiteType: "SousCompte", localId: uuid(), operation: "CREATE", payload: { compteId: B.compteId, nom: "Intrus" } },
      ]).expect(201);
      for (const x of r.body.resultats) expect(x.statut).toBe("ERROR");
      expect(await instantane(prisma, B.hotelId)).toBe(avantB);
    });
  });

  describe("charges absurdes : jamais d'erreur 500", () => {
    const GARBAGE: [string, object][] = [
      ["payload vide", {}],
      ["null partout", { numero: null, type: null, prixParNuit: null }],
      ["tableaux et objets", { numero: [], type: {}, prixParNuit: [1] }],
      ["nombres géants", { numero: "X", type: "Y", prixParNuit: 1e308, devise: "USD" }],
      ["texte énorme", { numero: "N".repeat(100_000), type: "Y", prixParNuit: 1, devise: "USD" }],
      ["devise inconnue", { numero: "G-1", type: "Y", prixParNuit: 1, devise: "EUR" }],
      ["prototype pollué", JSON.parse('{"__proto__":{"x":1},"numero":"G-2","type":"Y","prixParNuit":1,"devise":"USD"}')],
    ];
    it.each(GARBAGE)("CREATE Chambre : %s", async (_nom, payload) => {
      const r = await push(A, "patron", [{ entiteType: "Chambre", localId: uuid(), operation: "CREATE", payload }]);
      expect(r.status).toBe(201);
      expect(r.body.resultats[0].statut).toMatch(/SYNCED|ERROR/);
    });

    it("UPDATE sans remoteId ni baseSyncVersion, remoteId non-UUID : erreurs claires", async () => {
      const r = await push(A, "recep", [
        { entiteType: "Chambre", localId: uuid(), operation: "UPDATE", payload: { statut: "LIBRE" } },
        { entiteType: "Chambre", localId: uuid(), operation: "UPDATE", remoteId: "pas-un-uuid", baseSyncVersion: 1, payload: { statut: "LIBRE" } },
      ]);
      expect(r.status).toBeLessThan(500);
    });

    it("plus de 200 opérations dans un lot : refusé proprement (400)", async () => {
      const ops = Array.from({ length: 201 }, () => ({ entiteType: "Chambre", localId: uuid(), operation: "CREATE", payload: {} }));
      await push(A, "patron", ops).expect(400);
    });
  });
});
