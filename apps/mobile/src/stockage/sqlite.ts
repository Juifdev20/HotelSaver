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
  `);
}
