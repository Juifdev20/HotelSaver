import type { EntitePull, EntitePush } from "@hotel-chicago/api-client";
import type { Chambre } from "@hotel-chicago/types";
import type { ConflitSync, LigneFileAttente, StockageLocal } from "@hotel-chicago/sync-engine";
import { obtenirBase } from "./sqlite";

function genererId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface LigneFileAttenteBrute {
  id: string;
  entiteType: EntitePush;
  localId: string;
  remoteId: string | null;
  operation: "CREATE" | "UPDATE";
  payload: string;
  baseSyncVersion: number | null;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

function depuisLigneBrute(ligne: LigneFileAttenteBrute): LigneFileAttente {
  return {
    id: ligne.id,
    entiteType: ligne.entiteType,
    localId: ligne.localId,
    remoteId: ligne.remoteId ?? undefined,
    operation: ligne.operation,
    payload: JSON.parse(ligne.payload),
    baseSyncVersion: ligne.baseSyncVersion ?? undefined,
    createdAt: ligne.createdAt,
    attempts: ligne.attempts,
    lastError: ligne.lastError ?? undefined,
  };
}

/**
 * Implémentation `StockageLocal` (packages/sync-engine) pour mobile, en
 * SQLite (voir sqlite.ts pour le schéma). Seule l'entité Chambre a un miroir
 * réel pour l'instant (voir chambresMirroir.ts et le plan) — les autres
 * types passent par ce stockage silencieusement sans effet, faute de table
 * dédiée, en attendant d'être câblés plus tard.
 */
export async function creerStockageLocalMobile(): Promise<StockageLocal> {
  const db = await obtenirBase();

  return {
    async listerFileAttente() {
      const lignes = await db.getAllAsync<LigneFileAttenteBrute>("SELECT * FROM sync_queue ORDER BY createdAt ASC", []);
      return lignes.map(depuisLigneBrute);
    },

    async ajouterFileAttente(ligne) {
      const id = genererId();
      const createdAt = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO sync_queue (id, entiteType, localId, remoteId, operation, payload, baseSyncVersion, createdAt, attempts, lastError)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
        [id, ligne.entiteType, ligne.localId, ligne.remoteId ?? null, ligne.operation, JSON.stringify(ligne.payload), ligne.baseSyncVersion ?? null, createdAt]
      );
      return { ...ligne, id, createdAt, attempts: 0 };
    },

    async retirerFileAttente(id) {
      await db.runAsync("DELETE FROM sync_queue WHERE id = ?", [id]);
    },

    async marquerEchecFileAttente(id, erreur) {
      await db.runAsync("UPDATE sync_queue SET attempts = attempts + 1, lastError = ? WHERE id = ?", [erreur, id]);
    },

    async ajouterConflit(conflit) {
      await db.runAsync(
        `INSERT INTO sync_conflicts (id, entiteType, localId, remoteId, monChangement, donneesServeur, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          genererId(),
          conflit.entiteType,
          conflit.localId,
          conflit.remoteId ?? null,
          JSON.stringify(conflit.monChangement),
          JSON.stringify(conflit.donneesServeur),
          new Date().toISOString(),
        ]
      );
    },

    async listerConflits() {
      const lignes = await db.getAllAsync<{
        id: string;
        entiteType: EntitePush;
        localId: string;
        remoteId: string | null;
        monChangement: string;
        donneesServeur: string;
        createdAt: string;
      }>("SELECT * FROM sync_conflicts ORDER BY createdAt DESC", []);
      return lignes.map(
        (l): ConflitSync => ({
          id: l.id,
          entiteType: l.entiteType,
          localId: l.localId,
          remoteId: l.remoteId ?? undefined,
          monChangement: JSON.parse(l.monChangement),
          donneesServeur: JSON.parse(l.donneesServeur),
          createdAt: l.createdAt,
        })
      );
    },

    async supprimerConflit(id) {
      await db.runAsync("DELETE FROM sync_conflicts WHERE id = ?", [id]);
    },

    async lireDernierePull(entiteType: EntitePull) {
      const ligne = await db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM sync_meta WHERE cle = ?", [
        `dernierePull:${entiteType}`,
      ]);
      return ligne?.valeur ?? null;
    },

    async ecrireDernierePull(entiteType: EntitePull, horodatage: string) {
      await db.runAsync("INSERT OR REPLACE INTO sync_meta (cle, valeur) VALUES (?, ?)", [
        `dernierePull:${entiteType}`,
        horodatage,
      ]);
    },

    async idsEnAttente(entiteType: EntitePush) {
      const lignes = await db.getAllAsync<{ localId: string; remoteId: string | null }>(
        "SELECT localId, remoteId FROM sync_queue WHERE entiteType = ?",
        [entiteType]
      );
      return new Set(lignes.map((l) => l.remoteId ?? l.localId));
    },

    async appliquerLignesServeur(entiteType, lignes) {
      if (entiteType === "Chambre") {
        for (const brute of lignes as Chambre[]) {
          await upsertChambre(db, brute);
        }
        return;
      }
      // Autres entités : pas encore de table miroir dédiée (voir le plan).
    },

    async confirmerPush(entiteType, localId, remoteId, syncVersion) {
      if (entiteType === "Chambre") {
        await db.runAsync("UPDATE chambres SET id = ?, syncVersion = ? WHERE id = ?", [remoteId, syncVersion, localId]);
      }
    },

    async appliquerResolutionConflit(entiteType, donneesServeur) {
      if (entiteType === "Chambre") {
        await upsertChambre(db, donneesServeur as Chambre);
      }
    },
  };
}

async function upsertChambre(db: Awaited<ReturnType<typeof obtenirBase>>, chambre: Chambre): Promise<void> {
  await db.runAsync(
    `INSERT INTO chambres (id, numero, type, prixParNuit, devise, statut, photos, updatedAt, syncVersion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       numero = excluded.numero, type = excluded.type, prixParNuit = excluded.prixParNuit,
       devise = excluded.devise, statut = excluded.statut, photos = excluded.photos,
       updatedAt = excluded.updatedAt, syncVersion = excluded.syncVersion`,
    [chambre.id, chambre.numero, chambre.type, chambre.prixParNuit, chambre.devise, chambre.statut, JSON.stringify(chambre.photos), chambre.updatedAt, chambre.syncVersion]
  );
}
