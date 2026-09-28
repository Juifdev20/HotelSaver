import type { ClientApi, EntitePull, EntitePush, OperationPush, ResultatOperation } from "@hotel-chicago/api-client";
import { MoteurSync, SEUIL_ECHEC_DEFINITIF } from "./moteur-sync";
import type { ConflitSync, LigneFileAttente, StockageLocal } from "./types";

/** Stockage en mémoire, pour tester MoteurSync sans SQLite ni appareil. */
function creerStockageFactice(): StockageLocal & {
  file: LigneFileAttente[];
  conflits: ConflitSync[];
  miroir: unknown[];
  confirmations: { entiteType: EntitePull; localId: string; remoteId: string; syncVersion: number }[];
} {
  let compteur = 0;
  const file: LigneFileAttente[] = [];
  const conflits: ConflitSync[] = [];
  const miroir: unknown[] = [];
  const confirmations: { entiteType: EntitePull; localId: string; remoteId: string; syncVersion: number }[] = [];
  const dernierePull = new Map<string, string>();

  return {
    file,
    conflits,
    miroir,
    confirmations,
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
    async confirmerPush(entiteType, localId, remoteId, syncVersion) {
      confirmations.push({ entiteType, localId, remoteId, syncVersion });
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

  it("tire tout l'historique (depuis l'epoch) d'une entité jamais synchronisée, même si une autre entité a déjà un curseur avancé", async () => {
    const stockage = creerStockageFactice();
    let depuisRecu: string | null = null;
    const client = creerClientFactice({
      syncPull: async (depuis) => {
        depuisRecu = depuis;
        return { Produit: [{ id: "p1", nom: "Bière", syncVersion: 1 }] };
      },
    });

    // Chambre a déjà un historique récent (curseur avancé) ; Produit vient
    // d'être ajouté à entitesPull et n'a jamais été tiré (aucune entrée dans
    // sync_meta) — le lot groupé doit quand même repartir de l'epoch pour que
    // Produit reçoive tout son historique, pas juste ce qui a changé depuis
    // le dernier pull de Chambre.
    await stockage.ecrireDernierePull("Chambre", "2026-09-20T00:00:00.000Z");

    const moteur = new MoteurSync(client, stockage, ["Chambre", "Produit"]);
    await moteur.forcerSynchronisation();

    expect(depuisRecu).toBe(new Date(0).toISOString());
    expect(stockage.miroir).toEqual([{ id: "p1", nom: "Bière", syncVersion: 1 }]);
  });

  it("annulerOperation retire une entrée de la file sans la retenter et la retourne à l'appelant", async () => {
    const stockage = creerStockageFactice();
    const client = creerClientFactice();
    const moteur = new MoteurSync(client, stockage, []);

    await stockage.ajouterFileAttente({ entiteType: "LigneCommande", localId: "l1", operation: "CREATE", payload: { produitId: "p1" } });
    const [ligneEnAttente] = await moteur.listerFileAttente();

    const retiree = await moteur.annulerOperation(ligneEnAttente.id);

    expect(retiree?.localId).toBe("l1");
    expect(stockage.file).toHaveLength(0);
    expect(moteur.etatActuel().enAttente).toBe(0);
  });

  it("idsEnAttente délègue au stockage pour un type d'entité donné", async () => {
    const stockage = creerStockageFactice();
    const client = creerClientFactice();
    const moteur = new MoteurSync(client, stockage, []);

    await stockage.ajouterFileAttente({ entiteType: "SousCompte", localId: "sc1", operation: "CREATE", payload: { nom: "Jean" } });

    expect(await moteur.idsEnAttente("SousCompte")).toEqual(new Set(["sc1"]));
    expect(await moteur.idsEnAttente("CompteCafeteria")).toEqual(new Set());
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

  it("renseigne le remoteId des enfants créés implicitement par un CREATE parent", async () => {
    const stockage = creerStockageFactice();
    const client = creerClientFactice({
      syncPush: async (operations) =>
        operations.map((op) => ({
          localId: op.localId,
          remoteId: "compte-serveur-1",
          syncVersion: 1,
          statut: "SYNCED",
          enfants: [{ entiteType: "SousCompte" as const, localId: "sc-local", remoteId: "sc-serveur", syncVersion: 1 }],
        })),
    });
    const moteur = new MoteurSync(client, stockage, []);

    await stockage.ajouterFileAttente({
      entiteType: "CompteCafeteria",
      localId: "compte-local",
      operation: "CREATE",
      payload: { tableOuNom: "Table 1", nomPremierSousCompte: "Juif", premierSousCompteLocalId: "sc-local" },
    });
    await moteur.forcerSynchronisation();

    expect(stockage.confirmations).toEqual([
      { entiteType: "CompteCafeteria", localId: "compte-local", remoteId: "compte-serveur-1", syncVersion: 1 },
      { entiteType: "SousCompte", localId: "sc-local", remoteId: "sc-serveur", syncVersion: 1 },
    ]);
    expect(stockage.file).toHaveLength(0);
  });

  it("ne re-pousse plus une opération après SEUIL_ECHEC_DEFINITIF rejets métier", async () => {
    const stockage = creerStockageFactice();
    let appelsPush = 0;
    const client = creerClientFactice({
      syncPush: async (operations) => {
        appelsPush += 1;
        return operations.map((op) => ({ localId: op.localId, statut: "ERROR", message: "rejet métier" }));
      },
    });
    const moteur = new MoteurSync(client, stockage, []);

    await stockage.ajouterFileAttente({ entiteType: "LigneCommande", localId: "l1", operation: "CREATE", payload: { produitId: "p1" } });

    for (let i = 0; i < SEUIL_ECHEC_DEFINITIF + 2; i++) {
      await moteur.forcerSynchronisation();
    }

    // Exactement SEUIL_ECHEC_DEFINITIF envois : ensuite l'opération reste en
    // file pour une décision humaine au lieu d'être réémise à chaque poll.
    expect(appelsPush).toBe(SEUIL_ECHEC_DEFINITIF);
    expect(stockage.file).toHaveLength(1);
    expect(stockage.file[0].attempts).toBe(SEUIL_ECHEC_DEFINITIF);
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
