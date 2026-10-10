import * as SQLite from "expo-sqlite";
import { PersistanceSqlite, type BaseSqliteMinimale } from "@hotel-chicago/miroir-local";

/** Une base SQLite PAR hôtel (`hotelsaver-<hotelId>.db`) : deux hôtels sur un même téléphone ne se mélangent jamais. */
export async function ouvrirPersistanceHotel(hotelId: string): Promise<PersistanceSqlite> {
  const db = await SQLite.openDatabaseAsync(`hotelsaver-${hotelId}.db`);
  const base: BaseSqliteMinimale = {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: (sql, params = []) => db.runAsync(sql, params as SQLite.SQLiteBindParams),
    getAllAsync: <T,>(sql: string, params: unknown[] = []) => db.getAllAsync<T>(sql, params as SQLite.SQLiteBindParams),
    withTransactionAsync: (tache) => db.withTransactionAsync(tache),
  };
  return new PersistanceSqlite(base, () => void db.closeAsync().catch(() => {}));
}
