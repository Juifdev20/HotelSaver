import type { ClientApi, EntitePush, OperationPush, ResultatOperation } from "@hotel-chicago/api-client";
import { MoteurSync } from "./moteur-sync";
import type { ConflitSync, LigneFileAttente, StockageLocal } from "./types";

/** Stockage en mémoire, pour tester MoteurSync sans SQLite ni appareil. */
function creerStockageFactice(): StockageLocal & { file: LigneFileAttente[]; conflits: ConflitSync[]; miroir: unknown[] } {
  let compteur = 0;
  const file: LigneFileAttente[] = [];
  const conflits: ConflitSync[] = [];
  const miroir: unknown[] = [];
  const dernierePull = new Map<string, string>();

  return {
    file,
    conflits,
    miroir,
    async listerFileAttente() {
      return [...file];
    },
    async ajouterFileAttente(ligne) {
      const complete: LigneFileAttente = { ...ligne, id: `f${++compteur}`, createdAt: new Date().toISOString(), attempts: 0 };
      file.push(complete);
      return complete;
    },
    async retirerFileAttente(id) {
      const index = file.findIndex((l) => l.id === id);
      if (index >= 0) file.splice(index, 1);
    },
    async marquerEchecFileAttente(id, erreur) {
      const ligne = file.find((l) => l.id === id);
      if (ligne) {
        ligne.attempts += 1;
        ligne.lastError = erreur;
      }
    },
    async ajouterConflit(conflit) {
      conflits.push({ ...conflit, id: `c${++compteur}`, createdAt: new Date().toISOString() });
    },
    async listerConflits() {
      return [...conflits];
    },
    async supprimerConflit(id) {
      const index = conflits.findIndex((c) => c.id === id);
      if (index >= 0) conflits.splice(index, 1);
    },
    async lireDernierePull(entiteType) {
      return dernierePull.get(entiteType) ?? null;
    },
    async ecrireDernierePull(entiteType, horodatage) {
      dernierePull.set(entiteType, horodatage);
    },
    async idsEnAttente(entiteType: EntitePush) {
      return new Set(file.filter((l) => l.entiteType === entiteType).map((l) => l.remoteId ?? l.localId));
    },
    async appliquerLignesServeur(_entiteType, lignes) {
      miroir.push(...lignes);
    },
    async confirmerPush() {
      // pas nécessaire pour ces tests
    },
    async appliquerResolutionConflit() {
      // pas nécessaire pour ces tests
    },
  };
}

function creerClientFactice(overrides: Partial<ClientApi> = {}): ClientApi {
  return {
    estJoignable: async () => true,
    syncPush: async (operations: OperationPush[]): Promise<ResultatOperation[]> =>
      operations.map((op) => ({ localId: op.localId, remoteId: op.remoteId ?? op.localId, syncVersion: (op.baseSyncVersion ?? 0) + 1, statut: "SYNCED" })),
    syncPull: async () => ({}),
    ...overrides,
  } as ClientApi;
}

describe("MoteurSync", () => {
  it("pousse une opération en attente puis vide la file en cas de succès", async () => {
    const stockage = creerStockageFactice();
    const client = creerClientFactice();
    const moteur = new MoteurSync(client, stockage, []);

    await moteur.mettreEnFile({ entiteType: "Chambre", localId: "r1", remoteId: "r1", operation: "UPDATE", payload: { statut: "OCCUPEE" }, baseSyncVersion: 1 });
    // mettreEnFile déclenche un cycle en tâche de fond ; laisser les micro-tâches se dérouler.
    await moteur.forcerSynchronisation();

    expect(stockage.file).toHaveLength(0);
    expect(moteur.etatActuel().enAttente).toBe(0);
  });

  it("déplace une opération en conflit vers la liste des conflits sans la perdre", async () => {
    const stockage = creerStockageFactice();
    const client = creerClientFactice({
      syncPush: async (operations) =>
        operations.map((op) => ({
          localId: op.localId,
          statut: "CONFLICT",
          syncVersion: 5,
          donneesServeur: { id: op.remoteId, statut: "RESERVEE", syncVersion: 5 },
        })),
    });
    const moteur = new MoteurSync(client, stockage, []);

    await moteur.mettreEnFile({ entiteType: "Chambre", localId: "r1", remoteId: "r1", operation: "UPDATE", payload: { statut: "OCCUPEE" }, baseSyncVersion: 1 });
    await moteur.forcerSynchronisation();

    expect(stockage.file).toHaveLength(0);
    expect(stockage.conflits).toHaveLength(1);
    expect(stockage.conflits[0].donneesServeur).toEqual({ id: "r1", statut: "RESERVEE", syncVersion: 5 });
    expect(moteur.etatActuel().conflits).toBe(1);
  });

  it("ignore, lors d'un pull, les lignes dont l'id a une entrée en attente (anti-écrasement)", async () => {
    const stockage = creerStockageFactice();
    const client = creerClientFactice({
      // Ne répond à aucune des opérations envoyées (tableau vide) : r1 reste
      // dans la file après pousser(), comme si sa réponse n'était pas encore
      // arrivée — le cas que l'anti-écrasement doit couvrir au moment où
      // tirer() s'exécute juste après, dans le même cycle.
      syncPush: async () => [],
      syncPull: async () => ({
        Chambre: [
          { id: "r1", statut: "LIBRE", syncVersion: 3 },
          { id: "r2", statut: "OCCUPEE", syncVersion: 2 },
        ],
      }),
    });
    const moteur = new MoteurSync(client, stockage, ["Chambre"]);

    // r1 a une modification en attente : le pull ne doit pas écraser son état local avec l'ancien statut serveur.
    await stockage.ajouterFileAttente({ entiteType: "Chambre", localId: "r1", remoteId: "r1", operation: "UPDATE", payload: { statut: "OCCUPEE" }, baseSyncVersion: 1 });
    await moteur.forcerSynchronisation();

    expect(stockage.miroir).toEqual([{ id: "r2", statut: "OCCUPEE", syncVersion: 2 }]);
  });

  it("ne lance qu'un seul cycle à la fois pour des appels concurrents", async () => {
    const stockage = creerStockageFactice();
    let appelsSyncPull = 0;
    const client = creerClientFactice({
      syncPull: async () => {
        appelsSyncPull += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {};
      },
    });
    const moteur = new MoteurSync(client, stockage, ["Chambre"]);

    await Promise.all([moteur.forcerSynchronisation(), moteur.forcerSynchronisation(), moteur.forcerSynchronisation()]);

    expect(appelsSyncPull).toBe(1);
  });

  it("passe hors-ligne sans erreur quand le serveur est injoignable", async () => {
    const stockage = creerStockageFactice();
    const client = creerClientFactice({ estJoignable: async () => false });
    const moteur = new MoteurSync(client, stockage, []);

    await moteur.forcerSynchronisation();

    expect(moteur.etatActuel().enLigne).toBe(false);
    expect(moteur.etatActuel().derniereErreur).toBeNull();
  });

  it("applique un backoff croissant sur des échecs réseau successifs, réinitialisé après un succès", async () => {
    jest.useFakeTimers();
    try {
      const stockage = creerStockageFactice();
      let echoue = true;
      const client = creerClientFactice({
        syncPull: async () => {
          if (echoue) throw new Error("panne réseau");
          return {};
        },
      });
      const moteur = new MoteurSync(client, stockage, ["Chambre"]);

      await moteur.forcerSynchronisation();
      expect(moteur.etatActuel().derniereErreur).toBe("panne réseau");

      // Toujours dans la fenêtre de backoff (5s) : un nouvel essai immédiat ne relance pas l'appel.
      await moteur.forcerSynchronisation();
      expect(moteur.etatActuel().derniereErreur).toBe("panne réseau");

      jest.advanceTimersByTime(5_001);
      echoue = false;
      await moteur.forcerSynchronisation();
      expect(moteur.etatActuel().derniereErreur).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
