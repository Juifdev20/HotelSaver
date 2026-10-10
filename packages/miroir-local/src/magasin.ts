/**
 * Base de documents locale : des « collections » de documents JSON identifiés par un `id`, gardées EN MÉMOIRE (lectures
 * instantanées, requêtes en JavaScript) et recopiées sur disque à chaque écriture par une `Persistance` (IndexedDB sur le bureau).
 *
 * Pourquoi pas SQLite sur le bureau : aucune extension native à recompiler pour Electron, donc rien qui puisse empêcher
 * l'application de démarrer sur un poste ; IndexedDB est transactionnel, fiable, et vit dans le profil de l'application.
 * La mémoire est suffisante : un hôtel, même après des années, tient en quelques dizaines de milliers de lignes.
 */

export type OperationMagasin =
  | { type: "ecrire"; collection: string; id: string; valeur: unknown }
  | { type: "supprimer"; collection: string; id: string };

export interface DocumentPersiste {
  collection: string;
  id: string;
  valeur: unknown;
}

/** Où et comment les documents sont gardés sur disque. `appliquer` est atomique : tout ou rien. */
export interface Persistance {
  chargerTout(): Promise<DocumentPersiste[]>;
  appliquer(operations: OperationMagasin[]): Promise<void>;
  /** Efface TOUT (déconnexion définitive, changement d'hôtel). */
  effacer(): Promise<void>;
  fermer?(): void;
}

export class MagasinDocuments {
  private readonly donnees = new Map<string, Map<string, any>>();
  /** Écritures mises bout à bout : l'ordre d'appel est l'ordre d'application, même si une écriture disque est lente. */
  private queue: Promise<unknown> = Promise.resolve();
  private ouvert = false;

  constructor(private readonly persistance: Persistance) {}

  async ouvrir(): Promise<void> {
    if (this.ouvert) return;
    for (const doc of await this.persistance.chargerTout()) {
      this.collection(doc.collection, true)!.set(doc.id, doc.valeur);
    }
    this.ouvert = true;
  }

  private collection(nom: string, creer: boolean): Map<string, any> | undefined {
    let c = this.donnees.get(nom);
    if (!c && creer) {
      c = new Map();
      this.donnees.set(nom, c);
    }
    return c;
  }

  obtenir<T = any>(collection: string, id: string): T | undefined {
    return this.donnees.get(collection)?.get(id);
  }

  lister<T = any>(collection: string): T[] {
    return [...(this.donnees.get(collection)?.values() ?? [])];
  }

  compter(collection: string): number {
    return this.donnees.get(collection)?.size ?? 0;
  }

  /** Noms des collections (hors celles qui commencent par « _ », réservées au fonctionnement interne). */
  collections(): string[] {
    return [...this.donnees.keys()];
  }

  /**
   * Applique des écritures : d'abord sur disque (si cela échoue, la mémoire n'a pas changé et l'appelant reçoit l'erreur — jamais
   * une action « enregistrée » à l'écran mais perdue au redémarrage), puis en mémoire.
   */
  appliquer(operations: OperationMagasin[]): Promise<void> {
    if (operations.length === 0) return Promise.resolve();
    const tache = this.queue.then(async () => {
      await this.persistance.appliquer(operations);
      for (const op of operations) {
        if (op.type === "ecrire") this.collection(op.collection, true)!.set(op.id, op.valeur);
        else this.donnees.get(op.collection)?.delete(op.id);
      }
    });
    // Une erreur ne doit pas bloquer les écritures suivantes ; elle reste visible pour celui qui l'a demandée.
    this.queue = tache.catch(() => undefined);
    return tache;
  }

  ecrire(collection: string, valeur: { id: string; [champ: string]: any }): Promise<void> {
    return this.appliquer([{ type: "ecrire", collection, id: valeur.id, valeur }]);
  }

  supprimer(collection: string, id: string): Promise<void> {
    return this.appliquer([{ type: "supprimer", collection, id }]);
  }

  async effacerTout(): Promise<void> {
    await this.queue;
    await this.persistance.effacer();
    this.donnees.clear();
  }

  fermer(): void {
    this.persistance.fermer?.();
  }
}
