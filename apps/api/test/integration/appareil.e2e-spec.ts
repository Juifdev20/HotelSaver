/**
 * De bout en bout : de VRAIS appareils (base locale + client « d'abord sur l'appareil » + moteur de synchronisation) face au VRAI
 * serveur et à la VRAIE base Postgres. Le réseau est coupé/rétabli par appareil. C'est ce test qui dit si « ça marche sans connexion ».
 */
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as jwt from "jsonwebtoken";
import { prisma } from "@hotel-chicago/database";
import { ErreurApi } from "@hotel-chicago/api-client";
import { PersistanceMemoire, ouvrirMiroir, type Miroir } from "@hotel-chicago/miroir-local";
import { SEUIL_ECHEC_DEFINITIF } from "@hotel-chicago/sync-engine";
import { AppModule } from "../../src/app.module";
import { VERIFICATEUR_JWT, VerificateurJwtHs256 } from "../../src/common/auth/verificateur-jwt";
import { SupabaseAdminService } from "../../src/common/supabase-admin/supabase-admin.service";
import { decrire, verifierBaseJetable } from "./base";
import { JeuHotel, creerHotel, viderBase } from "./donnees";

const SECRET = "secret-de-test-integration";
const p = prisma as any;
const JOUR = 86_400_000;
const iso = (jours: number) => new Date(Date.now() + jours * JOUR).toISOString();

decrire("Appareils hors ligne face au vrai serveur", () => {
  let app: INestApplication;
  let url: string;
  let A: JeuHotel;
  let B: JeuHotel;
  const coupes = new Set<string>(); // appareils sans réseau
  const reponsePerdue = new Set<string>(); // appareils dont la PROCHAINE réponse de /sync/push se perd
  const vraiFetch = globalThis.fetch;
  const appareils: Miroir[] = [];

  async function creerAppareil(id: string, jeu: JeuHotel, role: "patron" | "recep" | "caf"): Promise<Miroir & { id: string }> {
    const profil = {
      userId: jeu.userIds[role], hotelId: jeu.hotelId, role: ({ patron: "PATRON", recep: "RECEPTIONNISTE", caf: "CAFETARIA" } as const)[role],
      nom: `${role} ${jeu.prefixe}`, cuisineActivee: true,
    };
    const miroir = await ouvrirMiroir({
      persistance: new PersistanceMemoire(),
      baseUrl: url,
      getAccessToken: () => jwt.sign({ sub: jeu.auth[role], dev: id }, SECRET),
      utilisateur: () => profil,
    });
    appareils.push(miroir);
    return Object.assign(miroir, { id });
  }

  /** Laisse les envois lancés en tâche de fond par les écritures terminer leur tentative (échouée) avant de rétablir le réseau. */
  const laisserEssayer = () => new Promise((resolve) => setTimeout(resolve, 40));

  /** Envoie tout ce qui attend, jusqu'à file vide (ou renoncement après quelques tours). */
  async function synchroniser(m: Miroir, tours = 6) {
    for (let i = 0; i < tours; i++) {
      await m.moteur.forcerSynchronisation();
      if ((await m.actionsEnAttente()) === 0 && m.moteur.etatActuel().derniereErreur === null) break;
    }
  }

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
    await app.listen(0, "127.0.0.1");
    url = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;

    // Réseau simulé : le jeton porte l'identifiant de l'appareil ; coupé = la requête n'atteint jamais le serveur.
    globalThis.fetch = (async (entree: any, init: any) => {
      const bearer = String(init?.headers?.Authorization ?? "").replace("Bearer ", "");
      const dev = bearer ? (jwt.decode(bearer) as { dev?: string } | null)?.dev : undefined;
      if (dev && coupes.has(dev)) throw new TypeError("fetch failed (réseau coupé)");
      const reponse = await vraiFetch(entree, init);
      if (dev && reponsePerdue.has(dev) && String(entree).endsWith("/sync/push")) {
        reponsePerdue.delete(dev);
        throw new TypeError("fetch failed (réponse perdue)"); // le serveur a travaillé, l'appareil ne le sait pas
      }
      return reponse;
    }) as typeof fetch;
  });

  afterAll(async () => {
    globalThis.fetch = vraiFetch;
    appareils.forEach((m) => m.fermer());
    await app?.close();
  });

  // ============================================================================================================

  it("première synchronisation : l'appareil reçoit les données de SON hôtel, rien d'un autre", async () => {
    const recep = await creerAppareil("R1", A, "recep");
    expect(recep.amorce()).toBe(false);
    await synchroniser(recep);
    expect(recep.amorce()).toBe(true);
    const chambres = await recep.client.listerChambres();
    expect(chambres.map((c) => c.numero).sort()).toEqual(["101", "102"]);
    expect(JSON.stringify(await recep.client.listerReservations())).not.toContain(B.reservationId);
    expect((await recep.client.listerClients()).map((c) => c.nom)).toEqual(["Client-A"]);
    expect(recep.moteur.etatActuel().derniereSyncReussieLe).toBeTruthy();
  });

  it("une journée de réception SANS connexion : réserver, installer, facturer, libérer — puis tout arrive au serveur, sans doublon", async () => {
    const recep = await creerAppareil("R2", A, "recep");
    await synchroniser(recep);
    const chambre = (await recep.client.listerChambres()).find((c) => c.numero === "101")!;

    coupes.add("R2"); // ← la connexion tombe
    const resa = await recep.client.creerReservation({
      chambreId: chambre.id, client: { nom: "Marie Hors-ligne", telephone: "+243810000009" }, dateArrivee: iso(-0.2), dateDepart: iso(0.8), installerImmediatement: true,
    });
    expect(resa.statut).toBe("EN_COURS");
    expect(resa.client.nom).toBe("Marie Hors-ligne");
    expect((await recep.client.listerChambres()).find((c) => c.id === chambre.id)!.statut).toBe("OCCUPEE");

    const facture = await recep.client.creerFacture({ reservationId: resa.id, modePaiement: "CASH" as any });
    expect(facture.numeroRecu).toMatch(/^TEMP-[A-Z0-9]{4}-\d{8}-001$/);
    expect(Number(facture.montantTotalUSD)).toBeGreaterThan(0);

    const sortie = await recep.client.checkOut(resa.id);
    expect(sortie.statutReservation).toBe("TERMINEE");
    expect((await recep.client.listerChambres()).find((c) => c.id === chambre.id)!.statut).toBe("NETTOYAGE");
    expect(await recep.actionsEnAttente()).toBe(3);
    expect((await recep.client.recetteDuJour()).chambres!.montantUSD).toBeGreaterThan(0); // la recette inclut déjà la vente non envoyée
    expect(await p.facture.count({ where: { hotelId: A.hotelId, numeroProvisoire: { not: null } } })).toBe(0); // le serveur ne sait encore rien

    await laisserEssayer();
    coupes.delete("R2"); // ← la connexion revient
    await synchroniser(recep);

    expect(await recep.actionsEnAttente()).toBe(0);
    expect(recep.moteur.etatActuel().echecsDefinitifs).toBe(0);
    const serveur = await p.facture.findFirst({ where: { hotelId: A.hotelId, numeroProvisoire: facture.numeroRecu } });
    expect(serveur.numeroRecu).toMatch(/^REC-\d{8}-\d{4}$/);
    // sur l'appareil : le reçu provisoire est devenu le vrai, rien n'est en double
    const apres = await recep.client.listerFactures();
    expect(apres.filter((f) => f.reservationId === serveur.reservationId)).toHaveLength(1);
    expect(apres.find((f) => f.id === serveur.id)!.numeroRecu).toBe(serveur.numeroRecu);
    expect((await recep.client.listerReservations()).filter((r) => r.client.nom === "Marie Hors-ligne")).toHaveLength(1);
    expect(await p.reservation.count({ where: { hotelId: A.hotelId, client: { nom: "Marie Hors-ligne" } } })).toBe(1);
    expect(await p.client.count({ where: { hotelId: A.hotelId, nom: "Marie Hors-ligne" } })).toBe(1);
    expect((await p.chambre.findUnique({ where: { id: chambre.id } })).statut).toBe("NETTOYAGE");
    // l'ancien identifiant local reste utilisable par un écran resté ouvert
    expect((await recep.client.obtenirReservation(resa.id)).id).toBe(serveur.reservationId);
  });

  it("la réponse du serveur se perd après l'envoi : l'appareil renvoie, le serveur ne crée rien en double", async () => {
    const recep = await creerAppareil("R3", A, "recep");
    await synchroniser(recep);
    const chambre = (await recep.client.listerChambres()).find((c) => c.numero === "102")!;
    coupes.add("R3");
    const resa = await recep.client.creerReservation({ chambreId: chambre.id, client: { nom: "Réponse Perdue" }, dateArrivee: iso(10), dateDepart: iso(12) });
    await laisserEssayer();
    coupes.delete("R3");
    reponsePerdue.add("R3");
    await recep.moteur.forcerSynchronisation(); // le serveur crée, la réponse ne revient pas
    expect(await p.reservation.count({ where: { hotelId: A.hotelId, client: { nom: "Réponse Perdue" } } })).toBe(1);
    expect(await recep.actionsEnAttente()).toBeGreaterThan(0);
    await synchroniser(recep, 8);
    expect(await recep.actionsEnAttente()).toBe(0);
    expect(await p.reservation.count({ where: { hotelId: A.hotelId, client: { nom: "Réponse Perdue" } } })).toBe(1);
    expect((await recep.client.listerReservations()).filter((r) => r.client.nom === "Réponse Perdue")).toHaveLength(1);
    expect(resa.id).toBeTruthy();
  });

  it("deux postes réservent la même chambre hors ligne : le second est refusé à la synchro, avec le motif ; abandonner le remet d'aplomb", async () => {
    const r1 = await creerAppareil("R4", A, "recep");
    const r2 = await creerAppareil("R5", A, "recep");
    await synchroniser(r1); await synchroniser(r2);
    const chambre = (await r1.client.listerChambres()).find((c) => c.numero === "102")!;
    coupes.add("R4"); coupes.add("R5");
    await r1.client.creerReservation({ chambreId: chambre.id, client: { nom: "Premier Arrivé" }, dateArrivee: iso(30), dateDepart: iso(33) });
    const perdant = await r2.client.creerReservation({ chambreId: chambre.id, client: { nom: "Second Arrivé" }, dateArrivee: iso(31), dateDepart: iso(34) });
    await laisserEssayer();
    coupes.clear();
    await synchroniser(r1);
    for (let i = 0; i < SEUIL_ECHEC_DEFINITIF + 1; i++) await r2.moteur.forcerSynchronisation();

    const file = await r2.moteur.listerFileAttente();
    const refusee = file.find((l) => l.entiteType === "Reservation")!;
    expect(refusee.attempts).toBeGreaterThanOrEqual(SEUIL_ECHEC_DEFINITIF);
    expect(refusee.lastError).toContain("déjà réservée");
    expect(r2.moteur.etatActuel().echecsDefinitifs).toBeGreaterThan(0);
    expect(await p.reservation.count({ where: { hotelId: A.hotelId, client: { nom: "Second Arrivé" } } })).toBe(0);

    await r2.abandonnerAction(refusee.id);
    await synchroniser(r2);
    expect((await r2.client.listerReservations()).some((r) => r.id === perdant.id)).toBe(false);
    expect((await r2.client.listerClients()).some((c) => c.nom === "Second Arrivé")).toBe(false);
    expect((await r2.client.listerReservations()).some((r) => r.client.nom === "Premier Arrivé")).toBe(true);
    expect(r2.moteur.etatActuel().echecsDefinitifs).toBe(0);
  });

  it("cafétaria sans connexion : ouvrir un compte, servir, encaisser (reçu provisoire) — le stock du serveur suit", async () => {
    const caf = await creerAppareil("C1", A, "caf");
    await synchroniser(caf);
    const biere = (await caf.client.listerProduits()).find((x) => x.nom === "Bière-A")!;
    const avant = Number((await p.produit.findUnique({ where: { id: biere.id } })).stockActuel);

    coupes.add("C1");
    const compte = await caf.client.ouvrirCompteCafeteria({ tableOuNom: "Terrasse 7", nomPremierSousCompte: "Paul" });
    const ligne = await caf.client.ajouterLigne(compte.id, { sousCompteId: compte.sousComptes[0].id, produitId: biere.id, quantite: 2 });
    expect(ligne.produit.nom).toBe("Bière-A");
    expect(Number((await caf.client.listerProduits()).find((x) => x.id === biere.id)!.stockActuel)).toBe(avant - 2);
    await expect(caf.client.ajouterLigne(compte.id, { sousCompteId: compte.sousComptes[0].id, produitId: biere.id, quantite: 9999 })).rejects.toThrow(/Stock insuffisant/);
    const ventes = await caf.client.encaisserCompte(compte.id, { mode: "GROUPE", modePaiement: "CASH" as any });
    expect(ventes[0].numeroRecu).toMatch(/^TEMP-/);
    expect(Number(ventes[0].montantTotalUSD)).toBe(6);
    expect((await caf.client.obtenirCompteCafeteria(compte.id)).statut).toBe("FERME");
    expect((await caf.client.listerComptesCafeteria("OUVERT" as any)).some((c) => c.id === compte.id)).toBe(false);
    await expect(caf.client.encaisserCompte(compte.id, { mode: "GROUPE", modePaiement: "CASH" as any })).rejects.toThrow(/déjà fermé/);

    await laisserEssayer();
    coupes.clear();
    await synchroniser(caf);
    expect(await caf.actionsEnAttente()).toBe(0);
    expect(Number((await p.produit.findUnique({ where: { id: biere.id } })).stockActuel)).toBe(avant - 2);
    const vente = await p.venteCafeteria.findFirst({ where: { hotelId: A.hotelId, numeroProvisoire: ventes[0].numeroRecu } });
    expect(vente.numeroRecu).toMatch(/^CAF-\d{8}-\d{4}$/);
    const locales = await caf.client.listerVentesCafeteria();
    expect(locales.filter((x) => x.id === vente.id)).toHaveLength(1);
    expect(locales.find((x) => x.id === vente.id)!.numeroRecu).toBe(vente.numeroRecu);
    expect((await caf.client.listerComptesCafeteria()).filter((c) => c.tableOuNom === "Terrasse 7")).toHaveLength(1);
    // le stock affiché localement est celui du serveur
    expect(Number((await caf.client.listerProduits()).find((x) => x.id === biere.id)!.stockActuel)).toBe(avant - 2);
  });

  it("deux changements d'état d'une chambre faits hors ligne, l'un sur l'autre : aucun faux conflit", async () => {
    const recep = await creerAppareil("R6", A, "recep");
    await synchroniser(recep);
    const chambre = (await recep.client.listerChambres()).find((c) => c.numero === "101")!;
    coupes.add("R6");
    await recep.client.modifierStatutChambre(chambre.id, "NETTOYAGE");
    await recep.client.modifierStatutChambre(chambre.id, "LIBRE");
    await laisserEssayer();
    coupes.clear();
    await synchroniser(recep);
    expect(recep.moteur.etatActuel().conflits).toBe(0);
    expect((await p.chambre.findUnique({ where: { id: chambre.id } })).statut).toBe("LIBRE");
  });

  it("deux postes modifient la même chambre : le second voit un conflit et peut garder la version du serveur", async () => {
    const r1 = await creerAppareil("R7", A, "recep");
    const r2 = await creerAppareil("R8", A, "recep");
    await synchroniser(r1); await synchroniser(r2);
    const chambre = (await r1.client.listerChambres()).find((c) => c.numero === "102")!;
    coupes.add("R7"); coupes.add("R8");
    await r1.client.modifierStatutChambre(chambre.id, "NETTOYAGE");
    await r2.client.modifierStatutChambre(chambre.id, "OCCUPEE");
    await laisserEssayer();
    coupes.clear();
    await synchroniser(r1);
    await r2.moteur.forcerSynchronisation();
    expect(r2.moteur.etatActuel().conflits).toBe(1);
    const [conflit] = await r2.moteur.listerConflits();
    await r2.moteur.resoudreConflitGarderServeur(conflit.id, conflit.entiteType, conflit.donneesServeur);
    expect(r2.moteur.etatActuel().conflits).toBe(0);
    expect((await r2.client.listerChambres()).find((c) => c.id === chambre.id)!.statut).toBe("NETTOYAGE");
  });

  it("un élément supprimé par le patron disparaît de l'autre poste à la synchro suivante", async () => {
    const recep = await creerAppareil("R9", A, "recep");
    await synchroniser(recep);
    const jetable = await p.chambre.create({ data: { hotelId: A.hotelId, numero: "SUPPR", type: "Std", prixParNuit: 1, devise: "USD" } });
    await synchroniser(recep);
    expect((await recep.client.listerChambres()).some((c) => c.numero === "SUPPR")).toBe(true);
    const patron = await creerAppareil("P1", A, "patron");
    await synchroniser(patron);
    await patron.client.supprimerChambre(jetable.id); // action réservée à la connexion
    await synchroniser(recep);
    expect((await recep.client.listerChambres()).some((c) => c.numero === "SUPPR")).toBe(false);
  });

  it("une action en ligne uniquement échoue proprement hors connexion, sans rien casser", async () => {
    const patron = await creerAppareil("P2", A, "patron");
    await synchroniser(patron);
    coupes.add("P2");
    await expect(patron.client.listerUtilisateurs()).rejects.toMatchObject({ statusCode: 0 });
    await expect(patron.client.supprimerChambre(A.chambreId)).rejects.toBeInstanceOf(ErreurApi);
    expect((await patron.client.listerChambres()).length).toBeGreaterThan(0); // la lecture locale continue
    coupes.clear();
  });

  it("le patron (qui n'opère pas) est refusé immédiatement sur l'appareil, comme par le serveur", async () => {
    const patron = await creerAppareil("P3", A, "patron");
    await synchroniser(patron);
    await expect(patron.client.checkIn(A.reservationId)).rejects.toThrow(/patron ne réalise pas/);
  });

  it("un appareil de l'hôtel B ne voit jamais les données de A, même après plusieurs synchronisations", async () => {
    const b = await creerAppareil("RB", B, "recep");
    await synchroniser(b); await synchroniser(b);
    const tout = JSON.stringify([await b.client.listerChambres(), await b.client.listerReservations(), await b.client.listerClients(), await b.client.listerFactures()]);
    expect(tout).not.toContain(A.chambreId);
    expect(tout).not.toContain("Marie Hors-ligne");
    expect(tout).not.toContain("Client-A");
  });
});
