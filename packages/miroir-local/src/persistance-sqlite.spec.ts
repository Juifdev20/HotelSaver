import { DatabaseSync } from "node:sqlite";
import { MagasinDocuments } from "./magasin";
import { PersistanceSqlite, type BaseSqliteMinimale } from "./persistance-sqlite";
import { StockageDocuments } from "./stockage-documents";

/** Enveloppe asynchrone autour de node:sqlite, calquée sur l'API d'expo-sqlite. */
function baseEnMemoire(fichier = ":memory:"): BaseSqliteMinimale & { fermer(): void; db: DatabaseSync } {
  const db = new DatabaseSync(fichier);
  let profondeur = 0;
  return {
    db,
    fermer: () => db.close(),
    execAsync: async (sql) => void db.exec(sql),
    runAsync: async (sql, params = []) => db.prepare(sql).run(...(params as any[])),
    getAllAsync: async <T>(sql: string, params: unknown[] = []) => db.prepare(sql).all(...(params as any[])) as T[],
    withTransactionAsync: async (tache) => {
      db.exec(profondeur++ === 0 ? "BEGIN" : "SAVEPOINT s");
      try {
        await tache();
        db.exec(--profondeur === 0 ? "COMMIT" : "RELEASE s");
      } catch (e) {
        profondeur = 0;
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

describe("PersistanceSqlite", () => {
  it("écrit, relit après réouverture, supprime", async () => {
    const dossier = require("node:fs").mkdtempSync(require("node:os").tmpdir() + "/hs-");
    const fichier = dossier + "/h.db";
    const b1 = baseEnMemoire(fichier);
    const m1 = new MagasinDocuments(new PersistanceSqlite(b1));
    await m1.ouvrir();
    await m1.ecrire("Chambre", { id: "c1", numero: "101", accents: "é à ü ☃" });
    await m1.appliquer([{ type: "ecrire", collection: "Chambre", id: "c2", valeur: { id: "c2" } }, { type: "supprimer", collection: "Chambre", id: "c1" }]);
    b1.fermer();

    const b2 = baseEnMemoire(fichier);
    const m2 = new MagasinDocuments(new PersistanceSqlite(b2));
    await m2.ouvrir();
    expect(m2.lister("Chambre").map((c: any) => c.id)).toEqual(["c2"]);
    b2.fermer();
  });

  it("un lot qui échoue au milieu n'écrit RIEN (tout ou rien)", async () => {
    const base = baseEnMemoire();
    const p = new PersistanceSqlite(base);
    const magasin = new MagasinDocuments(p);
    await magasin.ouvrir();
    await magasin.ecrire("Chambre", { id: "a" });
    const cyclique: any = { id: "b" };
    cyclique.soi = cyclique; // JSON.stringify échoue sur la 2e écriture
    await expect(magasin.appliquer([{ type: "ecrire", collection: "Chambre", id: "x", valeur: { id: "x" } }, { type: "ecrire", collection: "Chambre", id: "b", valeur: cyclique }])).rejects.toThrow();
    expect(magasin.obtenir("Chambre", "x")).toBeUndefined();
    const rel = new MagasinDocuments(new PersistanceSqlite(base));
    await rel.ouvrir();
    expect(rel.lister("Chambre").map((c: any) => c.id)).toEqual(["a"]);
  });

  it("fonctionne avec le stockage de synchronisation (file + renommage) puis redémarrage", async () => {
    const base = baseEnMemoire();
    const m = new MagasinDocuments(new PersistanceSqlite(base));
    await m.ouvrir();
    const s = new StockageDocuments(m);
    await m.ecrire("Reservation", { id: "L1", clientId: "L2", syncVersion: 1 });
    await s.ajouterFileAttente({ entiteType: "Reservation", localId: "L1", operation: "CREATE", payload: {} });
    await s.confirmerPush("Reservation", "L1", "R1", 1);
    const m2 = new MagasinDocuments(new PersistanceSqlite(base));
    await m2.ouvrir();
    expect(m2.obtenir("Reservation", "R1")).toBeDefined();
    expect(new StockageDocuments(m2).resoudreAlias("L1")).toBe("R1");
  });

  it("20 000 documents : chargement rapide", async () => {
    const base = baseEnMemoire();
    const m = new MagasinDocuments(new PersistanceSqlite(base));
    await m.ouvrir();
    const ops: any[] = [];
    for (let i = 0; i < 20000; i++) ops.push({ type: "ecrire", collection: "Reservation", id: `r${i}`, valeur: { id: `r${i}`, nom: "x".repeat(200) } });
    await m.appliquer(ops);
    const t0 = Date.now();
    const m2 = new MagasinDocuments(new PersistanceSqlite(base));
    await m2.ouvrir();
    expect(m2.compter("Reservation")).toBe(20000);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
