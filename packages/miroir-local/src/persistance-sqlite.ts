import type { DocumentPersiste, OperationMagasin, Persistance } from "./magasin";

/**
 * Le strict nécessaire d'une base SQLite asynchrone — `expo-sqlite` (téléphone) la satisfait telle quelle, et les tests la
 * remplacent par une petite enveloppe autour de `node:sqlite`.
 */
export interface BaseSqliteMinimale {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: unknown[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
  withTransactionAsync(tache: () => Promise<void>): Promise<void>;
}

/**
 * Persistance SQLite : UNE table de documents JSON (collection, id, json). Même contrat que `PersistanceIndexedDb` : un lot
 * d'écritures est une transaction — tout ou rien, même si le téléphone s'éteint au milieu. Une base (un fichier) PAR hôtel.
 */
export class PersistanceSqlite implements Persistance {
  private prete: Promise<void> | null = null;

  constructor(
    private readonly base: BaseSqliteMinimale,
    private readonly fermeture?: () => void
  ) {}

  private preparer(): Promise<void> {
    this.prete ??= this.base.execAsync(
      `CREATE TABLE IF NOT EXISTS documents (
         collection TEXT NOT NULL,
         id TEXT NOT NULL,
         json TEXT NOT NULL,
         PRIMARY KEY (collection, id)
       );`
    );
    return this.prete;
  }

  async chargerTout(): Promise<DocumentPersiste[]> {
    await this.preparer();
    const lignes = await this.base.getAllAsync<{ collection: string; id: string; json: string }>("SELECT collection, id, json FROM documents", []);
    return lignes.map((l) => ({ collection: l.collection, id: l.id, valeur: JSON.parse(l.json) }));
  }

  async appliquer(operations: OperationMagasin[]): Promise<void> {
    await this.preparer();
    await this.base.withTransactionAsync(async () => {
      for (const op of operations) {
        if (op.type === "ecrire") {
          await this.base.runAsync("INSERT OR REPLACE INTO documents (collection, id, json) VALUES (?, ?, ?)", [op.collection, op.id, JSON.stringify(op.valeur)]);
        } else {
          await this.base.runAsync("DELETE FROM documents WHERE collection = ? AND id = ?", [op.collection, op.id]);
        }
      }
    });
  }

  async effacer(): Promise<void> {
    await this.preparer();
    await this.base.runAsync("DELETE FROM documents", []);
  }

  fermer(): void {
    this.fermeture?.();
  }
}
