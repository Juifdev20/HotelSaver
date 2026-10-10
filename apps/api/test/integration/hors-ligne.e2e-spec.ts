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
const JOUR = 86_400_000;
const iso = (decalageJours: number) => new Date(Date.now() + decalageJours * JOUR).toISOString();

decrire("Travail hors ligne : suites d'actions rejouées d'un coup, reçus provisoires, ordres", () => {
  let app: INestApplication;
  let A: JeuHotel;
  let B: JeuHotel;

  const as = (j: JeuHotel, role: "patron" | "recep" | "caf") => `Bearer ${jwt.sign({ sub: j.auth[role] }, SECRET)}`;
  const push = (j: JeuHotel, role: "patron" | "recep" | "caf", operations: object[]) =>
    request(app.getHttpServer()).post("/sync/push").set("Authorization", as(j, role)).send({ operations });

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

  /** Une journée de réception entièrement hors ligne : réservation + client inline, arrivée, facture — tout cité par identifiants LOCAUX. */
  const journeeReception = (numeroChambre: string) => {
    const reservation = uuid(), client = uuid(), checkIn = uuid(), facture = uuid();
    return {
      ids: { reservation, client, checkIn, facture },
      operations: [
        { entiteType: "Reservation", localId: reservation, operation: "CREATE", payload: { chambreId: numeroChambre, client: { nom: "Marie Hors-ligne", telephone: "+243810000001" }, clientLocalId: client, dateArrivee: iso(-1), dateDepart: iso(1) } },
        { entiteType: "ActionReservation", localId: checkIn, operation: "CREATE", payload: { reservationId: reservation, action: "CHECK_IN" } },
        { entiteType: "Facture", localId: facture, operation: "CREATE", payload: { reservationId: reservation, modePaiement: "CASH", numeroProvisoire: "TEMP-AB12-20261010-001" } },
      ],
    };
  };

  describe("réception : réserver, installer, facturer sans connexion", () => {
    it("une file complète citant des identifiants locaux passe d'un coup, avec le reçu provisoire conservé", async () => {
      const chambre = await p.chambre.create({ data: { hotelId: A.hotelId, numero: "H-1", type: "Std", prixParNuit: 40, devise: "USD" } });
      const j = journeeReception(chambre.id);
      const r = await push(A, "recep", j.operations).expect(201);
      expect(r.body.resultats.map((x: any) => x.statut)).toEqual(["SYNCED", "SYNCED", "SYNCED"]);

      const facture = await p.facture.findFirst({ where: { hotelId: A.hotelId, numeroProvisoire: "TEMP-AB12-20261010-001" }, include: { reservation: true } });
      expect(facture).toBeTruthy();
      expect(facture.numeroRecu).toMatch(/^REC-\d{8}-\d{4}$/); // le vrai numéro est attribué par le serveur
      expect(facture.reservation.statut).toBe("EN_COURS");
      expect(Number(facture.montantTotalUSD)).toBe(80);
      expect((await p.chambre.findUnique({ where: { id: chambre.id } })).statut).toBe("OCCUPEE");
      // l'identifiant local du client inline est aussi résoluble par la suite
      const rep = r.body.resultats[0];
      expect(rep.enfants?.[0]).toMatchObject({ entiteType: "Client", localId: j.ids.client });
    });

    it("rejouer toute la file (réponse perdue) ne crée ni deuxième facture ni deuxième réservation", async () => {
      const chambre = await p.chambre.create({ data: { hotelId: A.hotelId, numero: "H-2", type: "Std", prixParNuit: 40, devise: "USD" } });
      const j = journeeReception(chambre.id);
      await push(A, "recep", j.operations).expect(201);
      const r2 = await push(A, "recep", j.operations).expect(201);
      expect(r2.body.resultats.map((x: any) => x.statut)).toEqual(["SYNCED", "SYNCED", "SYNCED"]);
      expect(await p.reservation.count({ where: { hotelId: A.hotelId, chambreId: chambre.id } })).toBe(1);
      expect(await p.facture.count({ where: { hotelId: A.hotelId, reservation: { chambreId: chambre.id } } })).toBe(1);
    });

    it("les actions peuvent arriver dans des envois différents : l'identifiant local reste résolu", async () => {
      const chambre = await p.chambre.create({ data: { hotelId: A.hotelId, numero: "H-3", type: "Std", prixParNuit: 40, devise: "USD" } });
      const j = journeeReception(chambre.id);
      await push(A, "recep", [j.operations[0]]).expect(201);
      const r = await push(A, "recep", j.operations.slice(1)).expect(201);
      expect(r.body.resultats.map((x: any) => x.statut)).toEqual(["SYNCED", "SYNCED"]);
    });

    it("si la réservation est refusée, ce qui en dépend est refusé avec une raison claire, sans rien créer", async () => {
      const chambre = await p.chambre.create({ data: { hotelId: A.hotelId, numero: "H-4", type: "Std", prixParNuit: 40, devise: "USD" } });
      const j = journeeReception(chambre.id);
      (j.operations[0].payload as any).dateDepart = (j.operations[0].payload as any).dateArrivee; // départ = arrivée : refusé
      const r = await push(A, "recep", j.operations).expect(201);
      expect(r.body.resultats[0].statut).toBe("ERROR");
      expect(r.body.resultats[1]).toMatchObject({ statut: "ERROR", message: expect.stringContaining("refusée") });
      expect(r.body.resultats[2].statut).toBe("ERROR");
      expect(await p.facture.count({ where: { hotelId: A.hotelId, reservation: { chambreId: chambre.id } } })).toBe(0);
    });

    it("deux postes qui facturent en même temps obtiennent deux numéros de reçu différents", async () => {
      const chambres = await Promise.all(["H-5", "H-6", "H-7", "H-8"].map((n) => p.chambre.create({ data: { hotelId: A.hotelId, numero: n, type: "Std", prixParNuit: 10, devise: "USD" } })));
      const journees = chambres.map((c: any) => journeeReception(c.id));
      const reponses = await Promise.all(journees.map((j: any) => push(A, "recep", j.operations)));
      for (const r of reponses) expect(r.body.resultats.map((x: any) => x.statut)).toEqual(["SYNCED", "SYNCED", "SYNCED"]);
      const numeros = (await p.facture.findMany({ where: { hotelId: A.hotelId, reservation: { chambreId: { in: chambres.map((c: any) => c.id) } } } })).map((f: any) => f.numeroRecu);
      expect(new Set(numeros).size).toBe(4);
    });

    it("check-out puis rejeu : la chambre passe en nettoyage une fois, l'ordre rejoué reste SYNCED", async () => {
      const chambre = await p.chambre.create({ data: { hotelId: A.hotelId, numero: "H-9", type: "Std", prixParNuit: 10, devise: "USD" } });
      const j = journeeReception(chambre.id);
      await push(A, "recep", j.operations).expect(201);
      const sortie = { entiteType: "ActionReservation", localId: uuid(), operation: "CREATE", payload: { reservationId: j.ids.reservation, action: "CHECK_OUT" } };
      const r1 = await push(A, "recep", [sortie]).expect(201);
      const r2 = await push(A, "recep", [sortie]).expect(201);
      expect(r1.body.resultats[0].statut).toBe("SYNCED");
      expect(r2.body.resultats[0].statut).toBe("SYNCED");
      expect((await p.chambre.findUnique({ where: { id: chambre.id } })).statut).toBe("NETTOYAGE");
    });

    it("un ordre devenu impossible est refusé avec son motif (annulation faite entre-temps ailleurs)", async () => {
      const chambre = await p.chambre.create({ data: { hotelId: A.hotelId, numero: "H-10", type: "Std", prixParNuit: 10, devise: "USD" } });
      const resa = await p.reservation.create({ data: { hotelId: A.hotelId, chambreId: chambre.id, clientId: A.clientId, dateArrivee: new Date(Date.now() + 5 * JOUR), dateDepart: new Date(Date.now() + 6 * JOUR), statut: "ANNULEE", origine: "RECEPTION", createdBy: A.userIds.recep } });
      const r = await push(A, "recep", [{ entiteType: "ActionReservation", localId: uuid(), operation: "CREATE", payload: { reservationId: resa.id, action: "CHECK_IN" } }]).expect(201);
      expect(r.body.resultats[0].statut).toBe("ERROR");
      expect(r.body.resultats[0].message).toContain("ANNULEE");
    });
  });

  describe("cafétaria : ouvrir, servir, encaisser sans connexion", () => {
    const serviceHorsLigne = (produitId: string, quantite = 2) => {
      const compte = uuid(), sousCompte = uuid(), ligne = uuid(), vente = uuid();
      return {
        ids: { compte, sousCompte, ligne, vente },
        operations: [
          { entiteType: "CompteCafeteria", localId: compte, operation: "CREATE", payload: { tableOuNom: "Terrasse 4", premierSousCompteLocalId: sousCompte } },
          { entiteType: "LigneCommande", localId: ligne, operation: "CREATE", horodatageClient: new Date(Date.now() - 3_600_000).toISOString(), payload: { compteId: compte, sousCompteId: sousCompte, produitId, quantite } },
          { entiteType: "VenteCafeteria", localId: vente, operation: "CREATE", payload: { compteId: compte, mode: "GROUPE", modePaiement: "CASH", ventesLocalIds: [vente], numerosProvisoires: ["TEMP-AB12-20261010-002"] } },
        ],
      };
    };

    it("ouverture, ligne et encaissement cités par identifiants locaux : tout passe, le compte est fermé, le reçu provisoire est gardé", async () => {
      const j = serviceHorsLigne(A.produitId);
      const r = await push(A, "caf", j.operations).expect(201);
      expect(r.body.resultats.map((x: any) => x.statut)).toEqual(["SYNCED", "SYNCED", "SYNCED"]);
      const vente = await p.venteCafeteria.findUnique({ where: { id: r.body.resultats[2].remoteId } });
      expect(vente.numeroProvisoire).toBe("TEMP-AB12-20261010-002");
      expect(vente.numeroRecu).toMatch(/^CAF-\d{8}-\d{4}$/);
      expect(Number(vente.montantTotalUSD)).toBe(6); // 2 × 3 $
      expect((await p.compteCafeteria.findUnique({ where: { id: r.body.resultats[0].remoteId } })).statut).toBe("FERME");
    });

    it("rejouer la file ne facture pas deux fois et ne décompte pas le stock deux fois", async () => {
      const avant = Number((await p.produit.findUnique({ where: { id: A.produitId } })).stockActuel);
      const j = serviceHorsLigne(A.produitId, 1);
      await push(A, "caf", j.operations).expect(201);
      const r2 = await push(A, "caf", j.operations).expect(201);
      expect(r2.body.resultats.map((x: any) => x.statut)).toEqual(["SYNCED", "SYNCED", "SYNCED"]);
      expect(Number((await p.produit.findUnique({ where: { id: A.produitId } })).stockActuel)).toBe(avant - 1);
      expect(await p.venteCafeteria.count({ where: { hotelId: A.hotelId, numeroProvisoire: "TEMP-AB12-20261010-002" } })).toBeGreaterThanOrEqual(1);
    });

    it("une vente déjà faite est enregistrée même si le stock du serveur est insuffisant (stock négatif, pas de vente perdue)", async () => {
      const produit = await p.produit.create({ data: { hotelId: A.hotelId, nom: "Dernier", categorie: "X", prix: 2, devise: "USD", stockActuel: 1 } });
      const j = serviceHorsLigne(produit.id, 3);
      const r = await push(A, "caf", j.operations).expect(201);
      expect(r.body.resultats.map((x: any) => x.statut)).toEqual(["SYNCED", "SYNCED", "SYNCED"]);
      expect(Number((await p.produit.findUnique({ where: { id: produit.id } })).stockActuel)).toBe(-2);
    });

    it("partage par personne : un reçu par sous-compte, les identifiants locaux supplémentaires reviennent en enfants", async () => {
      const compte = uuid(), sc1 = uuid(), sc2 = uuid(), l1 = uuid(), l2 = uuid(), v1 = uuid(), v2 = uuid();
      const r = await push(A, "caf", [
        { entiteType: "CompteCafeteria", localId: compte, operation: "CREATE", payload: { tableOuNom: "Table 9", premierSousCompteLocalId: sc1 } },
        { entiteType: "SousCompte", localId: sc2, operation: "CREATE", payload: { compteId: compte, nom: "Paul" } },
        { entiteType: "LigneCommande", localId: l1, operation: "CREATE", payload: { compteId: compte, sousCompteId: sc1, produitId: A.platId, quantite: 1 } },
        { entiteType: "LigneCommande", localId: l2, operation: "CREATE", payload: { compteId: compte, sousCompteId: sc2, produitId: A.platId, quantite: 2 } },
        { entiteType: "VenteCafeteria", localId: v1, operation: "CREATE", payload: { compteId: compte, mode: "PAR_SOUS_COMPTE", modePaiement: "CASH", ventesLocalIds: [v1, v2], numerosProvisoires: ["TEMP-AB12-20261010-003", "TEMP-AB12-20261010-004"] } },
      ]).expect(201);
      expect(r.body.resultats.map((x: any) => x.statut)).toEqual(["SYNCED", "SYNCED", "SYNCED", "SYNCED", "SYNCED"]);
      const vente = r.body.resultats[4];
      expect(vente.enfants).toEqual([expect.objectContaining({ entiteType: "VenteCafeteria", localId: v2 })]);
      const ventes = await p.venteCafeteria.findMany({ where: { hotelId: A.hotelId, compteId: r.body.resultats[0].remoteId }, orderBy: { numeroProvisoire: "asc" } });
      expect(ventes.map((x: any) => x.numeroProvisoire)).toEqual(["TEMP-AB12-20261010-003", "TEMP-AB12-20261010-004"]);
      expect(new Set(ventes.map((x: any) => x.numeroRecu)).size).toBe(2);
    });

    it("l'avancement en cuisine voyage comme un ordre", async () => {
      const plat = await p.produit.create({ data: { hotelId: A.hotelId, nom: "Plat cuisine", categorie: "Plats", prix: 5, devise: "USD", typeProduit: "PLAT" } });
      const compte = uuid(), sc = uuid(), ligne = uuid(), ordre = uuid();
      const r = await push(A, "caf", [
        { entiteType: "CompteCafeteria", localId: compte, operation: "CREATE", payload: { tableOuNom: "Cuisine 1", premierSousCompteLocalId: sc } },
        { entiteType: "LigneCommande", localId: ligne, operation: "CREATE", payload: { compteId: compte, sousCompteId: sc, produitId: plat.id, quantite: 1 } },
        { entiteType: "ActionLigne", localId: ordre, operation: "CREATE", payload: { ligneId: ligne, statut: "EN_PREPARATION" } },
      ]).expect(201);
      expect(r.body.resultats.map((x: any) => x.statut)).toEqual(["SYNCED", "SYNCED", "SYNCED"]);
      expect((await p.ligneCommande.findUnique({ where: { id: r.body.resultats[1].remoteId } })).statut).toBe("EN_PREPARATION");
    });
  });

  describe("droits et étanchéité", () => {
    it("le patron n'opère pas par défaut (check-in, facture, encaissement refusés) mais peut annuler une réservation", async () => {
      const chambre = await p.chambre.create({ data: { hotelId: A.hotelId, numero: "D-1", type: "Std", prixParNuit: 10, devise: "USD" } });
      const resa = await p.reservation.create({ data: { hotelId: A.hotelId, chambreId: chambre.id, clientId: A.clientId, dateArrivee: new Date(Date.now() + 8 * JOUR), dateDepart: new Date(Date.now() + 9 * JOUR), statut: "CONFIRMEE", origine: "RECEPTION", createdBy: A.userIds.recep } });
      const r = await push(A, "patron", [
        { entiteType: "ActionReservation", localId: uuid(), operation: "CREATE", payload: { reservationId: resa.id, action: "CHECK_IN" } },
        { entiteType: "Facture", localId: uuid(), operation: "CREATE", payload: { reservationId: resa.id, modePaiement: "CASH" } },
        { entiteType: "VenteCafeteria", localId: uuid(), operation: "CREATE", payload: { compteId: A.compteId, mode: "GROUPE", modePaiement: "CASH" } },
        { entiteType: "ActionReservation", localId: uuid(), operation: "CREATE", payload: { reservationId: resa.id, action: "ANNULER", motif: "Client injoignable" } },
      ]).expect(201);
      expect(r.body.resultats.map((x: any) => x.statut)).toEqual(["ERROR", "ERROR", "ERROR", "SYNCED"]);
      expect((await p.reservation.findUnique({ where: { id: resa.id } })).statut).toBe("ANNULEE");
    });

    it("la cafétaria ne peut ni faire de check-in ni facturer un séjour", async () => {
      const r = await push(A, "caf", [
        { entiteType: "ActionReservation", localId: uuid(), operation: "CREATE", payload: { reservationId: A.reservationId, action: "CHECK_IN" } },
        { entiteType: "Facture", localId: uuid(), operation: "CREATE", payload: { reservationId: A.reservationTermineeId, modePaiement: "CASH" } },
      ]).expect(201);
      expect(r.body.resultats.map((x: any) => x.statut)).toEqual(["ERROR", "ERROR"]);
    });

    it("citer une réservation, un compte, une ligne ou une chambre de l'autre hôtel est refusé et ne change rien chez lui", async () => {
      const avant = await instantane(prisma, B.hotelId);
      const ops = [
        { entiteType: "ActionReservation", localId: uuid(), operation: "CREATE", payload: { reservationId: B.reservationId, action: "CHECK_IN" } },
        { entiteType: "ActionReservation", localId: uuid(), operation: "CREATE", payload: { reservationId: B.reservationId, action: "ANNULER", motif: "piraté" } },
        { entiteType: "Facture", localId: uuid(), operation: "CREATE", payload: { reservationId: B.reservationTermineeId, modePaiement: "CASH" } },
      ];
      const rr = await push(A, "recep", ops).expect(201);
      for (const x of rr.body.resultats) expect(x.statut).toBe("ERROR");
      const rc = await push(A, "caf", [
        { entiteType: "VenteCafeteria", localId: uuid(), operation: "CREATE", payload: { compteId: B.compteId, mode: "GROUPE", modePaiement: "CASH" } },
        { entiteType: "ActionLigne", localId: uuid(), operation: "CREATE", payload: { ligneId: B.ligneId, statut: "SERVI" } },
        { entiteType: "LigneCommande", localId: uuid(), operation: "CREATE", payload: { compteId: A.compteId, sousCompteId: B.sousCompteId, produitId: A.produitId, quantite: 1 } },
      ]).expect(201);
      for (const x of rc.body.resultats) expect(x.statut).toBe("ERROR");
      expect(await instantane(prisma, B.hotelId)).toBe(avant);
    });

    it("un identifiant local cité par l'autre hôtel n'est jamais résolu vers une ligne de ce premier hôtel", async () => {
      const chambre = await p.chambre.create({ data: { hotelId: A.hotelId, numero: "X-1", type: "Std", prixParNuit: 10, devise: "USD" } });
      const j = journeeReception(chambre.id);
      await push(A, "recep", j.operations).expect(201);
      const avant = await instantane(prisma, A.hotelId);
      // B cite les identifiants locaux de A : rien ne doit être trouvé ni modifié
      const r = await push(B, "recep", [{ entiteType: "ActionReservation", localId: uuid(), operation: "CREATE", payload: { reservationId: j.ids.reservation, action: "CHECK_OUT" } }]).expect(201);
      expect(r.body.resultats[0].statut).toBe("ERROR");
      expect(await instantane(prisma, A.hotelId)).toBe(avant);
    });
  });

  describe("charges absurdes sur les nouveaux ordres : jamais de 500", () => {
    const SALE: [string, string, object][] = [
      ["ActionReservation", "action inconnue", { reservationId: uuid(), action: "DETRUIRE" }],
      ["ActionReservation", "sans réservation", { action: "CHECK_IN" }],
      ["ActionReservation", "annulation sans motif", { reservationId: uuid(), action: "ANNULER" }],
      ["ActionLigne", "statut inconnu", { ligneId: uuid(), statut: "EXPLOSE" }],
      ["Facture", "mode de paiement inconnu", { reservationId: uuid(), modePaiement: "BITCOIN" }],
      ["Facture", "montant négatif", { reservationId: uuid(), modePaiement: "CASH", montantRegleParClient: -5, deviseRegleeParClient: "USD" }],
      ["VenteCafeteria", "sans compte", { mode: "GROUPE", modePaiement: "CASH" }],
      ["VenteCafeteria", "mode inconnu", { compteId: uuid(), mode: "TOUT", modePaiement: "CASH" }],
      ["VenteCafeteria", "listes énormes", { compteId: uuid(), mode: "GROUPE", modePaiement: "CASH", ventesLocalIds: Array(10_000).fill("x"), numerosProvisoires: [1, {}, null] }],
      ["Reservation", "dates absurdes", { chambreId: uuid(), clientId: uuid(), dateArrivee: "pas une date", dateDepart: "2026-01-01" }],
    ];
    it.each(SALE)("%s : %s", async (entiteType, _nom, payload) => {
      const r = await push(A, entiteType === "ActionLigne" || entiteType === "VenteCafeteria" ? "caf" : "recep", [{ entiteType, localId: uuid(), operation: "CREATE", payload }]);
      expect(r.status).toBe(201);
      expect(r.body.resultats[0].statut).toBe("ERROR");
      expect(r.body.resultats[0].temporaire).toBeFalsy();
    });
  });
});
