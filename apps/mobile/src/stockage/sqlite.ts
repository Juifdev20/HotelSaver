import * as SQLite from "expo-sqlite";

/**
 * Base partagée par tout l'appareil (pas par profil) : les Chambres sont une
 * vérité commune à l'hôtel, pas des données propres à un utilisateur — voir
 * DECISIONS.md.
 */
const NOM_BASE = "hotelchicago.db";

let promesseBase: Promise<SQLite.SQLiteDatabase> | null = null;

export function obtenirBase(): Promise<SQLite.SQLiteDatabase> {
  if (!promesseBase) {
    promesseBase = SQLite.openDatabaseAsync(NOM_BASE).then(async (db) => {
      await creerSchema(db);
      return db;
    });
  }
  return promesseBase;
}

async function creerSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS chambres (
      id TEXT PRIMARY KEY,
      numero TEXT NOT NULL,
      type TEXT NOT NULL,
      prixParNuit TEXT NOT NULL,
      devise TEXT NOT NULL,
      statut TEXT NOT NULL,
      photos TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      syncVersion INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entiteType TEXT NOT NULL,
      localId TEXT NOT NULL,
      remoteId TEXT,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      baseSyncVersion INTEGER,
      createdAt TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      lastError TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY,
      entiteType TEXT NOT NULL,
      localId TEXT NOT NULL,
      remoteId TEXT,
      monChangement TEXT NOT NULL,
      donneesServeur TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      cle TEXT PRIMARY KEY,
      valeur TEXT NOT NULL
    );

    -- Tables miroir Cafétaria (Phase 6, 26/09/2026) : contrairement à
    -- "chambres", ce sont des CREATE (compte/sous-compte/ligne n'existent pas
    -- encore côté serveur au moment de l'écriture optimiste) — "id" est donc
    -- l'id LOCAL stable, jamais renommé, et "remoteId" est rempli une fois la
    -- création confirmée par le serveur. Voir cafeteriaMirroir.ts.
    CREATE TABLE IF NOT EXISTS produits (
      id TEXT PRIMARY KEY,
      nom TEXT NOT NULL,
      categorie TEXT NOT NULL,
      prix TEXT NOT NULL,
      devise TEXT NOT NULL,
      photo TEXT,
      stockActuel TEXT NOT NULL,
      seuilAlerte TEXT NOT NULL,
      actif INTEGER NOT NULL,
      updatedAt TEXT NOT NULL,
      syncVersion INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comptes_cafeteria (
      id TEXT PRIMARY KEY,
      remoteId TEXT,
      tableOuNom TEXT NOT NULL,
      statut TEXT NOT NULL,
      ouvertPar TEXT NOT NULL,
      ouvertLe TEXT NOT NULL,
      fermeLe TEXT,
      updatedAt TEXT NOT NULL,
      syncVersion INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sous_comptes (
      id TEXT PRIMARY KEY,
      remoteId TEXT,
      compteId TEXT NOT NULL,
      nom TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      syncVersion INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lignes_commande (
      id TEXT PRIMARY KEY,
      remoteId TEXT,
      sousCompteId TEXT NOT NULL,
      produitId TEXT NOT NULL,
      quantite TEXT NOT NULL,
      prixUnitaire TEXT NOT NULL,
      devise TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      syncVersion INTEGER NOT NULL
    );
  `);
}
