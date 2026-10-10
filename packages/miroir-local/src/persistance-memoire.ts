import type { DocumentPersiste, OperationMagasin, Persistance } from "./magasin";

/** Persistance en mémoire : pour les tests, et en dernier recours si le stockage du navigateur est indisponible (rien ne survit au redémarrage). */
export class PersistanceMemoire implements Persistance {
  private readonly docs = new Map<string, DocumentPersiste>();
  /** Test : provoque l'échec de la prochaine écriture. */
  echecProchaineEcriture: Error | null = null;

  async chargerTout(): Promise<DocumentPersiste[]> {
    return structuredClone([...this.docs.values()]);
  }

  async appliquer(operations: OperationMagasin[]): Promise<void> {
    if (this.echecProchaineEcriture) {
      const erreur = this.echecProchaineEcriture;
      this.echecProchaineEcriture = null;
      throw erreur;
    }
    for (const op of operations) {
      const cle = `${op.collection}\u0000${op.id}`;
      if (op.type === "ecrire") this.docs.set(cle, { collection: op.collection, id: op.id, valeur: structuredClone(op.valeur) });
      else this.docs.delete(cle);
    }
  }

  async effacer(): Promise<void> {
    this.docs.clear();
  }
}
