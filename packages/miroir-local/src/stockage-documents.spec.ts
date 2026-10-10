import "fake-indexeddb/auto";
import { MagasinDocuments } from "./magasin";
import { PersistanceIndexedDb } from "./persistance-indexeddb";
import { PersistanceMemoire } from "./persistance-memoire";
import { StockageDocuments } from "./stockage-documents";

async function creer() {
  const persistance = new PersistanceMemoire();
  const magasin = new MagasinDocuments(persistance);
  await magasin.ouvrir();
  return { persistance, magasin, stockage: new StockageDocuments(magasin) };
}

describe("persistance", () => {
  it("IndexedDB : survit à la fermeture et à la réouverture (redémarrage de l'application)", async () => {
    const p1 = new MagasinDocuments(new PersistanceIndexedDb("test-redemarrage"));
    await p1.ouvrir();
    await p1.ecrire("Chambre", { id: "c1", numero: "101" });
    await p1.appliquer([{ type: "ecrire", collection: "Chambre", id: "c2", valeur: { id: "c2", numero: "102" } }, { type: "supprimer", collection: "Chambre", id: "c1" }]);
    p1.fermer();

    const p2 = new MagasinDocuments(new PersistanceIndexedDb("test-redemarrage"));
    await p2.ouvrir();
    expect(p2.lister("Chambre").map((c: any) => c.numero)).toEqual(["102"]);
  });

  it("deux hôtels = deux bases séparées", async () => {
    const a = new MagasinDocuments(new PersistanceIndexedDb("hotel-A"));
    const b = new MagasinDocuments(new PersistanceIndexedDb("hotel-B"));
    await a.ouvrir(); await b.ouvrir();
    await a.ecrire("Client", { id: "x", nom: "Client de A" });
    expect(b.compter("Client")).toBe(0);
    const b2 = new MagasinDocuments(new PersistanceIndexedDb("hotel-B"));
    await b2.ouvrir();
    expect(b2.compter("Client")).toBe(0);
  });

  it("une écriture disque qui échoue n'est PAS visible en mémoire (jamais une action perdue au redémarrage)", async () => {
    const { persistance, magasin } = await creer();
    persistance.echecProchaineEcriture = new Error("disque plein");
    await expect(magasin.ecrire("Chambre", { id: "c1" })).rejects.toThrow("disque plein");
    expect(magasin.obtenir("Chambre", "c1")).toBeUndefined();
    await magasin.ecrire("Chambre", { id: "c2" }); // les suivantes passent
    expect(magasin.obtenir("Chambre", "c2")).toBeDefined();
  });

  it("effacerTout vide mémoire ET disque", async () => {
    const p = new MagasinDocuments(new PersistanceIndexedDb("test-effacer"));
    await p.ouvrir();
    await p.ecrire("Chambre", { id: "c1" });
    await p.effacerTout();
    expect(p.compter("Chambre")).toBe(0);
    const p2 = new MagasinDocuments(new PersistanceIndexedDb("test-effacer"));
    await p2.ouvrir();
    expect(p2.compter("Chambre")).toBe(0);
  });
});

describe("file d'attente", () => {
  it("garde l'ordre exact des actions, même après redémarrage", async () => {
    const idb = new PersistanceIndexedDb("test-file");
    const m1 = new MagasinDocuments(idb);
    await m1.ouvrir();
    const s1 = new StockageDocuments(m1);
    for (const n of ["a", "b", "c"]) await s1.ajouterFileAttente({ entiteType: "Chambre", localId: n, operation: "CREATE", payload: {} });
    idb.fermer();
    const m2 = new MagasinDocuments(new PersistanceIndexedDb("test-file"));
    await m2.ouvrir();
    expect((await new StockageDocuments(m2).listerFileAttente()).map((l) => l.localId)).toEqual(["a", "b", "c"]);
  });

  it("ajoutées en parallèle, elles gardent un rang distinct", async () => {
    const { stockage } = await creer();
    await Promise.all(["a", "b", "c", "d"].map((n) => stockage.ajouterFileAttente({ entiteType: "Chambre", localId: n, operation: "CREATE", payload: {} })));
    expect((await stockage.listerFileAttente()).length).toBe(4);
  });

  it("un échec compte un essai et garde le message", async () => {
    const { stockage } = await creer();
    const l = await stockage.ajouterFileAttente({ entiteType: "Chambre", localId: "a", operation: "CREATE", payload: {} });
    await stockage.marquerEchecFileAttente(l.id, "refusé");
    expect((await stockage.listerFileAttente())[0]).toMatchObject({ attempts: 1, lastError: "refusé" });
  });

  it("idsEnAttente inclut les lignes touchées par un ordre (la réservation d'un check-in)", async () => {
    const { stockage } = await creer();
    await stockage.ajouterFileAttente({ entiteType: "ActionReservation", localId: "o1", operation: "CREATE", payload: {}, touche: [{ entiteType: "Reservation", id: "r1" }, { entiteType: "Chambre", id: "c1" }] });
    expect([...(await stockage.idsEnAttente("Reservation"))]).toEqual(["r1"]);
    expect([...(await stockage.idsEnAttente("Chambre"))]).toEqual(["c1"]);
  });
});

describe("confirmerPush : renommage local → serveur", () => {
  it("renomme la ligne, réécrit les références dans les autres lignes ET dans la file, garde un alias", async () => {
    const { stockage, magasin } = await creer();
    await magasin.ecrire("Reservation", { id: "L-resa", chambreId: "c1", clientId: "L-client", syncVersion: 1 });
    await magasin.ecrire("Client", { id: "L-client", nom: "Marie", syncVersion: 1 });
    await stockage.ajouterFileAttente({ entiteType: "Facture", localId: "L-fact", operation: "CREATE", payload: { reservationId: "L-resa", modePaiement: "CASH" } });
    await stockage.ajouterFileAttente({ entiteType: "ActionReservation", localId: "L-act", operation: "CREATE", payload: { reservationId: "L-resa", action: "CHECK_IN" }, touche: [{ entiteType: "Reservation", id: "L-resa" }] });

    await stockage.confirmerPush("Client", "L-client", "R-client", 1);
    await stockage.confirmerPush("Reservation", "L-resa", "R-resa", 3);

    expect(magasin.obtenir("Reservation", "L-resa")).toBeUndefined();
    expect(magasin.obtenir("Reservation", "R-resa")).toMatchObject({ id: "R-resa", clientId: "R-client", syncVersion: 3 });
    expect(magasin.obtenir("Client", "R-client")).toMatchObject({ nom: "Marie" });
    const file = await stockage.listerFileAttente();
    expect(file[0].payload).toMatchObject({ reservationId: "R-resa" });
    expect(file[1].payload).toMatchObject({ reservationId: "R-resa" });
    expect(file[1].touche).toEqual([{ entiteType: "Reservation", id: "R-resa" }]);
    // un écran resté sur l'ancien identifiant retrouve sa ligne
    expect(stockage.obtenir("Reservation", "L-resa")).toMatchObject({ id: "R-resa" });
  });

  it("si le pull a déjà apporté la ligne serveur (réponse perdue puis rejeu), il n'en reste qu'une", async () => {
    const { stockage, magasin } = await creer();
    await magasin.ecrire("Chambre", { id: "L-1", numero: "201", syncVersion: 1, local: true });
    await stockage.appliquerLignesServeur("Chambre", [{ id: "R-1", numero: "201", syncVersion: 1, updatedAt: "2026-10-10T10:00:00Z" }]);
    expect(magasin.compter("Chambre")).toBe(2);
    await stockage.confirmerPush("Chambre", "L-1", "R-1", 1);
    expect(magasin.compter("Chambre")).toBe(1);
    expect(magasin.obtenir("Chambre", "R-1")).toMatchObject({ numero: "201", updatedAt: "2026-10-10T10:00:00Z" });
  });

  it("les modifications suivantes de la même ligne repartent de la version confirmée", async () => {
    const { stockage } = await creer();
    await stockage.ajouterFileAttente({ entiteType: "Chambre", localId: "c1", remoteId: "c1", operation: "UPDATE", payload: { statut: "A" }, baseSyncVersion: 3 });
    await stockage.ajouterFileAttente({ entiteType: "Chambre", localId: "c1", remoteId: "c1", operation: "UPDATE", payload: { statut: "B" }, baseSyncVersion: 3 });
    await stockage.ajouterFileAttente({ entiteType: "Chambre", localId: "c2", remoteId: "c2", operation: "UPDATE", payload: { statut: "B" }, baseSyncVersion: 3 });
    await stockage.confirmerPush("Chambre", "c1", "c1", 4);
    expect((await stockage.listerFileAttente()).map((l) => l.baseSyncVersion)).toEqual([4, 4, 3]);
  });

  it("même identifiant : met seulement à jour la version", async () => {
    const { stockage, magasin } = await creer();
    await magasin.ecrire("Chambre", { id: "c1", syncVersion: 1 });
    await stockage.confirmerPush("Chambre", "c1", "c1", 4);
    expect(magasin.obtenir("Chambre", "c1")).toMatchObject({ syncVersion: 4 });
  });
});

describe("appliquerLignesServeur / suppressions", () => {
  it("n'écrase pas une ligne plus récente par une page ancienne relue", async () => {
    const { stockage, magasin } = await creer();
    await stockage.appliquerLignesServeur("Chambre", [{ id: "c1", statut: "LIBRE", syncVersion: 5, updatedAt: "t5" }]);
    await stockage.appliquerLignesServeur("Chambre", [{ id: "c1", statut: "OCCUPEE", syncVersion: 4, updatedAt: "t4" }]);
    expect(magasin.obtenir("Chambre", "c1")).toMatchObject({ statut: "LIBRE", syncVersion: 5 });
  });

  it("ne réécrit pas une ligne identique", async () => {
    const { stockage, persistance } = await creer();
    const ligne = { id: "c1", syncVersion: 1, updatedAt: "t1" };
    await stockage.appliquerLignesServeur("Chambre", [ligne]);
    const spy = jest.spyOn(persistance, "appliquer");
    await stockage.appliquerLignesServeur("Chambre", [ligne]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("une suppression serveur retire la ligne, sauf si une action locale la concerne encore", async () => {
    const { stockage, magasin } = await creer();
    await magasin.ecrire("Produit", { id: "p1" });
    await magasin.ecrire("Produit", { id: "p2" });
    await stockage.ajouterFileAttente({ entiteType: "Produit", localId: "x", remoteId: "p2", operation: "UPDATE", payload: { prix: 1 }, baseSyncVersion: 1 });
    await stockage.supprimerLignesServeur("Produit", ["p1", "p2", "inconnu"]);
    expect(magasin.obtenir("Produit", "p1")).toBeUndefined();
    expect(magasin.obtenir("Produit", "p2")).toBeDefined();
  });
});

describe("poste partagé : chaque action part sous le compte de son auteur", () => {
  it("le moteur ne voit que les actions de l'utilisateur connecté", async () => {
    let courant = "marie";
    const magasin = new MagasinDocuments(new PersistanceMemoire());
    await magasin.ouvrir();
    const stockage = new StockageDocuments(magasin, 3, () => courant);
    await stockage.ajouterFileAttente({ entiteType: "Chambre", localId: "a", operation: "CREATE", payload: {} });
    courant = "paul";
    await stockage.ajouterFileAttente({ entiteType: "Chambre", localId: "b", operation: "CREATE", payload: {} });
    expect((await stockage.listerFileAttente()).map((l) => l.localId)).toEqual(["b"]);
    courant = "marie";
    expect((await stockage.listerFileAttente()).map((l) => l.localId)).toEqual(["a"]);
    expect(stockage.compterToutesLesActions()).toBe(2);
  });
});
