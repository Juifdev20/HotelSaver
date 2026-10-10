import type { ClientApi, EntitePull, EntitePush, OperationPush, ReponsePush, ResultatOperation } from "@hotel-chicago/api-client";
import { ErreurApi } from "@hotel-chicago/api-client";
import { MoteurSync, SEUIL_ECHEC_DEFINITIF } from "./moteur-sync";
import type { ConflitSync, LigneFileAttente, StockageLocal } from "./types";

/** Stockage en mémoire, pour tester MoteurSync sans SQLite ni appareil. */
function creerStockageFactice(): StockageLocal & {
  file: LigneFileAttente[];
  conflits: ConflitSync[];
  miroir: unknown[];
  confirmations: { entiteType: EntitePull; localId: string; remoteId: string; syncVersion: number }[];
  supprimees: { entiteType: EntitePull; id: string }[];
  dernierePull: Map<string, string>;
} {
  let compteur = 0;
  const file: LigneFileAttente[] = [];
  const conflits: ConflitSync[] = [];
  const miroir: unknown[] = [];
  const confirmations: { entiteType: EntitePull; localId: string; remoteId: string; syncVersion: number }[] = [];
  const dernierePull = new Map<string, string>();
  const supprimees: { entiteType: EntitePull; id: string }[] = [];

  return {
    file,
    conflits,
    miroir,
    confirmations,
    dernierePull,
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
    async supprimerLignesServeur(entiteType, ids) {
      supprimees.push(...ids.map((id) => ({ entiteType, id })));
    },
    supprimees,
  };
}

type SurchargesClient = Omit<Partial<ClientApi>, "syncPush"> & {
  syncPush?: (operations: OperationPush[]) => Promise<ResultatOperation[] | ReponsePush>;
};

function creerClientFactice(overrides: SurchargesClient = {}): ClientApi {
  const { syncPush, ...autres } = overrides;
  return {
    estJoignable: async () => true,
    syncPush: async (operations: OperationPush[]): Promise<ReponsePush> => {
      const brut = syncPush
        ? await syncPush(operations)
        : operations.map((op): ResultatOperation => ({ localId: op.localId, remoteId: op.remoteId ?? op.localId, syncVersion: (op.baseSyncVersion ?? 0) + 1, statut: "SYNCED" }));
      return Array.isArray(brut) ? { resultats: brut } : brut;
    },
    syncPull: async () => ({}),
    ...autres,
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

  it("une écriture arrivée pendant un cycle en cours est envoyée juste après, sans attendre le poll", async () => {
    const stockage = creerStockageFactice();
    const envois: string[][] = [];
    let libererPull: () => void = () => {};
    const client = creerClientFactice({
      syncPush: async (operations) => {
        envois.push(operations.map((o) => o.localId));
        return operations.map((op) => ({ localId: op.localId, remoteId: op.localId, syncVersion: 1, statut: "SYNCED" }));
      },
      syncPull: () => new Promise((resolve) => (libererPull = () => resolve({}))),
    });
    const moteur = new MoteurSync(client, stockage, ["Chambre"]);

    const premierCycle = moteur.forcerSynchronisation(); // bloqué sur le pull
    await new Promise((r) => setTimeout(r, 0));
    await moteur.mettreEnFile({ entiteType: "CompteCafeteria", localId: "compte-1", operation: "CREATE", payload: { tableOuNom: "Comptoir" } });
    libererPull();
    await premierCycle;
    // Le cycle enchaîné tourne : on libère son pull à son tour.
    await new Promise((r) => setTimeout(r, 0));
    libererPull();
    await moteur.forcerSynchronisation();

    expect(envois).toContainEqual(["compte-1"]);
    expect(stockage.file).toHaveLength(0);
  });

  it("prévient les écrans dès la fin de l'envoi, avant la fin de la réception", async () => {
    const stockage = creerStockageFactice();
    let libererPull: () => void = () => {};
    const client = creerClientFactice({ syncPull: () => new Promise((resolve) => (libererPull = () => resolve({}))) });
    const moteur = new MoteurSync(client, stockage, ["Chambre"]);
    await stockage.ajouterFileAttente({ entiteType: "CompteCafeteria", localId: "c1", operation: "CREATE", payload: {} });

    const cycle = moteur.forcerSynchronisation();
    for (let i = 0; i < 10 && !moteur.etatActuel().dernierePousseeLe; i++) await new Promise((r) => setTimeout(r, 0));
    expect(moteur.etatActuel().dernierePousseeLe).not.toBeNull(); // pull toujours en attente
    libererPull();
    await cycle;
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

  describe("pull : curseur serveur, pagination, suppressions", () => {
    const iso = (ms: number) => new Date(ms).toISOString();

    it("prend comme point de départ l'heure du serveur (_meta.curseur), pas l'horloge de l'appareil", async () => {
      const stockage = creerStockageFactice();
      const client = creerClientFactice({
        syncPull: async () => ({ Chambre: [], _meta: { serveurLe: iso(5_000), curseur: iso(1_000), tronque: [], suppressions: [] } }),
      });
      const moteur = new MoteurSync(client, stockage, ["Chambre"]);
      await moteur.forcerSynchronisation();
      expect(stockage.dernierePull.get("Chambre")).toBe(iso(1_000));
    });

    it("page pleine : redemande à partir du dernier updatedAt jusqu'à épuisement, et enregistre le curseur à chaque page", async () => {
      const stockage = creerStockageFactice();
      const appels: { depuis: string; limite?: number }[] = [];
      const pages = [
        { Chambre: [{ id: "a", updatedAt: iso(1_000) }, { id: "b", updatedAt: iso(2_000) }], _meta: { serveurLe: iso(9_000), curseur: iso(8_000), tronque: ["Chambre"], suppressions: [] } },
        { Chambre: [{ id: "b", updatedAt: iso(2_000) }, { id: "c", updatedAt: iso(3_000) }], _meta: { serveurLe: iso(9_000), curseur: iso(8_000), tronque: [], suppressions: [] } },
      ];
      const client = creerClientFactice({
        syncPull: async (depuis: string, _e?: EntitePull[], limite?: number) => {
          appels.push({ depuis, limite });
          return pages[appels.length - 1] as never;
        },
      });
      const moteur = new MoteurSync(client, stockage, ["Chambre"]);
      await moteur.forcerSynchronisation();
      expect(appels).toHaveLength(2);
      expect(appels[1].depuis).toBe(iso(2_000));
      expect((stockage.miroir as { id: string }[]).map((l) => l.id)).toEqual(["a", "b", "b", "c"]);
      expect(stockage.dernierePull.get("Chambre")).toBe(iso(8_000));
    });

    it("page pleine sans progrès (même instant) : agrandit la page au lieu de boucler", async () => {
      const stockage = creerStockageFactice();
      const limites: (number | undefined)[] = [];
      const client = creerClientFactice({
        syncPull: async (_d: string, _e?: EntitePull[], limite?: number) => {
          limites.push(limite);
          const tronque = limites.length < 3;
          return { Chambre: [{ id: "x", updatedAt: iso(1_000) }], _meta: { serveurLe: iso(9_000), curseur: iso(8_000), tronque: tronque ? ["Chambre"] : [], suppressions: [] } } as never;
        },
      });
      await new MoteurSync(client, stockage, ["Chambre"]).forcerSynchronisation();
      // 1re page 1000 → curseur avance à 1000 ; 2e page au même instant → limite doublée ; 3e page complète.
      expect(limites).toEqual([1000, 1000, 2000]);
    });

    it("retire du miroir les éléments supprimés côté serveur", async () => {
      const stockage = creerStockageFactice();
      const client = creerClientFactice({
        syncPull: async () => ({
          Produit: [],
          _meta: { serveurLe: iso(5_000), curseur: iso(4_000), tronque: [], suppressions: [{ entiteType: "Produit", id: "p-9", supprimeLe: iso(3_000) }] },
        }),
      });
      await new MoteurSync(client, stockage, ["Produit"]).forcerSynchronisation();
      expect(stockage.supprimees).toEqual([{ entiteType: "Produit", id: "p-9" }]);
    });

    it("un pull sans _meta (ancien serveur) reste accepté", async () => {
      const stockage = creerStockageFactice();
      const client = creerClientFactice({ syncPull: async () => ({ Chambre: [{ id: "z" }] }) });
      await new MoteurSync(client, stockage, ["Chambre"]).forcerSynchronisation();
      expect(stockage.miroir).toHaveLength(1);
      expect(stockage.dernierePull.get("Chambre")).toBeTruthy();
    });
  });

  describe("envoi : pannes passagères, lots, horloge", () => {
    it("une panne passagère du serveur ne compte pas comme un échec de l'action", async () => {
      const stockage = creerStockageFactice();
      const client = creerClientFactice({
        syncPush: async (ops) => ops.map((op) => ({ localId: op.localId, statut: "ERROR", message: "indisponible", temporaire: true })),
      });
      const moteur = new MoteurSync(client, stockage, []);
      await stockage.ajouterFileAttente({ entiteType: "Chambre", localId: "l1", operation: "CREATE", payload: { numero: "1" } });
      await moteur.forcerSynchronisation();
      expect(stockage.file).toHaveLength(1);
      expect(stockage.file[0].attempts).toBe(0);
      expect(moteur.etatActuel().echecsDefinitifs).toBe(0);
    });

    it("découpe la file en lots de 200 opérations, dans l'ordre", async () => {
      const stockage = creerStockageFactice();
      const tailles: number[] = [];
      const client = creerClientFactice({
        syncPush: async (ops) => {
          tailles.push(ops.length);
          return ops.map((op) => ({ localId: op.localId, remoteId: op.localId, syncVersion: 1, statut: "SYNCED" }));
        },
      });
      for (let i = 0; i < 450; i++) await stockage.ajouterFileAttente({ entiteType: "MouvementStock", localId: `m${i}`, operation: "CREATE", payload: {} });
      await new MoteurSync(client, stockage, []).forcerSynchronisation();
      expect(tailles).toEqual([200, 200, 50]);
      expect(stockage.file).toHaveLength(0);
    });

    it("compte les actions définitivement refusées", async () => {
      const stockage = creerStockageFactice();
      const client = creerClientFactice({
        syncPush: async (ops) => ops.map((op) => ({ localId: op.localId, statut: "ERROR", message: "stock insuffisant" })),
      });
      const moteur = new MoteurSync(client, stockage, []);
      await stockage.ajouterFileAttente({ entiteType: "MouvementStock", localId: "m1", operation: "CREATE", payload: {} });
      for (let i = 0; i < SEUIL_ECHEC_DEFINITIF; i++) await moteur.forcerSynchronisation();
      expect(moteur.etatActuel().echecsDefinitifs).toBe(1);
    });

    it("mesure l'écart d'horloge, le signale au-delà de 5 min, et date l'action à l'heure du serveur", async () => {
      const stockage = creerStockageFactice();
      let horodatageEnvoye: string | undefined;
      let premier = true;
      const client = creerClientFactice({
        syncPush: async (ops) => {
          if (!premier) horodatageEnvoye = ops[0].horodatageClient;
          premier = false;
          return { resultats: ops.map((op) => ({ localId: op.localId, remoteId: op.localId, syncVersion: 1, statut: "SYNCED" as const })), serveurLe: new Date(Date.now() + 2 * 3_600_000).toISOString() };
        },
      });
      const moteur = new MoteurSync(client, stockage, []);
      await stockage.ajouterFileAttente({ entiteType: "MouvementStock", localId: "m1", operation: "CREATE", payload: {} });
      await moteur.forcerSynchronisation();
      expect(moteur.etatActuel().horlogeSuspecte).toBe(true);
      expect(Math.abs((moteur.etatActuel().decalageHorlogeMs ?? 0) - 2 * 3_600_000)).toBeLessThan(2_000);

      await stockage.ajouterFileAttente({ entiteType: "MouvementStock", localId: "m2", operation: "CREATE", payload: {} });
      await moteur.forcerSynchronisation();
      // l'action a été faite « maintenant » à l'heure de l'appareil → ramenée à l'heure du serveur (+2 h)
      expect(Math.abs(Date.parse(horodatageEnvoye!) - (Date.now() + 2 * 3_600_000))).toBeLessThan(5_000);
    });

    it("renseigne derniereSyncReussieLe après un cycle complet, pas après un échec", async () => {
      const stockage = creerStockageFactice();
      const moteur = new MoteurSync(creerClientFactice(), stockage, []);
      expect(moteur.etatActuel().derniereSyncReussieLe).toBeNull();
      await moteur.forcerSynchronisation();
      expect(moteur.etatActuel().derniereSyncReussieLe).toBeTruthy();
    });
  });

  it("réseau coupé en plein envoi : l'appareil passe HORS LIGNE (pas « en difficulté ») et l'action reste en file", async () => {
    const stockage = creerStockageFactice();
    const client = creerClientFactice({
      syncPush: async () => {
        throw new ErreurApi(0, "Impossible de joindre le serveur de l'hôtel.");
      },
    });
    const moteur = new MoteurSync(client, stockage, []);
    await moteur.forcerSynchronisation(); // premier cycle : en ligne
    await stockage.ajouterFileAttente({ entiteType: "Chambre", localId: "c1", remoteId: "c1", operation: "UPDATE", payload: { statut: "LIBRE" }, baseSyncVersion: 1 });
    await moteur.forcerSynchronisation();
    expect(moteur.etatActuel()).toMatchObject({ enLigne: false, derniereErreur: null, enAttente: 1 });
    expect(stockage.file).toHaveLength(1);
  });
});
