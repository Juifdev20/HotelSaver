import type { DocumentPersiste, OperationMagasin, Persistance } from "./magasin";

const MAGASIN = "documents";

function promesse<T>(requete: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error ?? new Error("Erreur IndexedDB."));
  });
}

function transactionTerminee(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Erreur IndexedDB."));
    tx.onabort = () => reject(tx.error ?? new Error("Écriture locale annulée."));
  });
}

/**
 * Persistance IndexedDB : une base PAR hôtel (`nomBase` contient l'identifiant de l'hôtel), jamais de mélange entre deux hôtels
 * sur un même poste. Chaque lot d'écritures est une transaction unique : tout ou rien, même si l'application est fermée en plein
 * milieu.
 */
export class PersistanceIndexedDb implements Persistance {
  private base: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly nomBase: string,
    private readonly fabrique: IDBFactory = indexedDB
  ) {}

  private ouvrir(): Promise<IDBDatabase> {
    if (!this.base) {
      this.base = new Promise((resolve, reject) => {
        const demande = this.fabrique.open(this.nomBase, 1);
        demande.onupgradeneeded = () => {
          demande.result.createObjectStore(MAGASIN, { keyPath: ["collection", "id"] });
        };
        demande.onsuccess = () => resolve(demande.result);
        demande.onerror = () => reject(demande.error ?? new Error("Impossible d'ouvrir la base locale."));
        demande.onblocked = () => reject(new Error("La base locale est bloquée par une autre fenêtre de l'application."));
      });
    }
    return this.base;
  }

  async chargerTout(): Promise<DocumentPersiste[]> {
    const base = await this.ouvrir();
    const tx = base.transaction(MAGASIN, "readonly");
    return (await promesse(tx.objectStore(MAGASIN).getAll())) as DocumentPersiste[];
  }

  async appliquer(operations: OperationMagasin[]): Promise<void> {
    const base = await this.ouvrir();
    const tx = base.transaction(MAGASIN, "readwrite");
    const magasin = tx.objectStore(MAGASIN);
    for (const op of operations) {
      if (op.type === "ecrire") magasin.put({ collection: op.collection, id: op.id, valeur: op.valeur });
      else magasin.delete([op.collection, op.id]);
    }
    await transactionTerminee(tx);
  }

  async effacer(): Promise<void> {
    const base = await this.ouvrir();
    const tx = base.transaction(MAGASIN, "readwrite");
    tx.objectStore(MAGASIN).clear();
    await transactionTerminee(tx);
  }

  fermer(): void {
    void this.base?.then((b) => b.close());
    this.base = null;
  }
}

/** Supprime complètement la base d'un hôtel (« Effacer les données de cet appareil »). */
export async function supprimerBaseIndexedDb(nomBase: string, fabrique: IDBFactory = indexedDB): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const demande = fabrique.deleteDatabase(nomBase);
    demande.onsuccess = () => resolve();
    demande.onerror = () => reject(demande.error ?? new Error("Suppression de la base locale impossible."));
    demande.onblocked = () => resolve();
  });
}
