import type { EntitePull, EntitePush } from "@hotel-chicago/api-client";
import type { Chambre, Produit } from "@hotel-chicago/types";
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

/** Formes brutes des lignes tirées de GET /sync/pull pour les entités
 * Cafétaria : des `findMany` Prisma plats, sans `include` (voir
 * apps/api/src/sync/sync.service.ts) — pas les types imbriqués de
 * @hotel-chicago/types (CompteCafeteria.sousComptes, etc.), reconstruits
 * côté client par cafeteriaMirroir.ts. */
interface CompteCafeteriaBrute {
  id: string;
  tableOuNom: string;
  statut: string;
  ouvertPar: string;
  ouvertLe: string;
  fermeLe: string | null;
  updatedAt: string;
  syncVersion: number;
}

interface SousCompteBrute {
  id: string;
  compteId: string;
  nom: string;
  updatedAt: string;
  syncVersion: number;
}

interface LigneCommandeBrute {
  id: string;
  sousCompteId: string;
  produitId: string;
  quantite: string;
  prixUnitaire: string;
  devise: string;
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
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
      if (entiteType === "Produit") {
        for (const brute of lignes as Produit[]) {
          await upsertProduit(db, brute);
        }
        return;
      }
      if (entiteType === "CompteCafeteria") {
        for (const brute of lignes as CompteCafeteriaBrute[]) {
          await upsertCompteCafeteria(db, brute);
        }
        return;
      }
      if (entiteType === "SousCompte") {
        for (const brute of lignes as SousCompteBrute[]) {
          await upsertSousCompte(db, brute);
        }
        return;
      }
      if (entiteType === "LigneCommande") {
        for (const brute of lignes as LigneCommandeBrute[]) {
          await upsertLigneCommande(db, brute);
        }
        return;
      }
      // Autres entités : pas encore de table miroir dédiée (voir le plan).
    },

    async confirmerPush(entiteType, localId, remoteId, syncVersion) {
      if (entiteType === "Chambre") {
        await db.runAsync("UPDATE chambres SET id = ?, syncVersion = ? WHERE id = ?", [remoteId, syncVersion, localId]);
        return;
      }
      // Cafétaria : id local jamais renommé (voir le plan — évite une re-clé
      // en cascade sur les enfants), seul "remoteId" est renseigné.
      if (entiteType === "CompteCafeteria") {
        await db.runAsync("UPDATE comptes_cafeteria SET remoteId = ?, syncVersion = ? WHERE id = ?", [remoteId, syncVersion, localId]);
      } else if (entiteType === "SousCompte") {
        await db.runAsync("UPDATE sous_comptes SET remoteId = ?, syncVersion = ? WHERE id = ?", [remoteId, syncVersion, localId]);
      } else if (entiteType === "LigneCommande") {
        await db.runAsync("UPDATE lignes_commande SET remoteId = ?, syncVersion = ? WHERE id = ?", [remoteId, syncVersion, localId]);
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

/** Produit n'a jamais de création locale (catalogue géré par le PATRON) :
 * upsert simple par id, comme Chambre. */
async function upsertProduit(db: Awaited<ReturnType<typeof obtenirBase>>, produit: Produit): Promise<void> {
  await db.runAsync(
    `INSERT INTO produits (id, nom, categorie, prix, devise, photo, stockActuel, seuilAlerte, actif, updatedAt, syncVersion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       nom = excluded.nom, categorie = excluded.categorie, prix = excluded.prix, devise = excluded.devise,
       photo = excluded.photo, stockActuel = excluded.stockActuel, seuilAlerte = excluded.seuilAlerte,
       actif = excluded.actif, updatedAt = excluded.updatedAt, syncVersion = excluded.syncVersion`,
    [
      produit.id, produit.nom, produit.categorie, produit.prix, produit.devise, produit.photo,
      produit.stockActuel, produit.seuilAlerte, produit.actif ? 1 : 0, produit.updatedAt, produit.syncVersion,
    ]
  );
}

/**
 * Cafétaria (CompteCafeteria/SousCompte/LigneCommande) : upsert par
 * `remoteId` d'abord (la ligne a peut-être été créée par cet appareil, sous
 * un id local différent), sinon par `id` (ligne venant d'un autre appareil,
 * jamais créée localement — `id = remoteId` dès l'insertion, voir le plan).
 */
async function upsertCompteCafeteria(db: Awaited<ReturnType<typeof obtenirBase>>, brute: CompteCafeteriaBrute): Promise<void> {
  const existant = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM comptes_cafeteria WHERE remoteId = ? OR id = ?",
    [brute.id, brute.id]
  );
  if (existant) {
    await db.runAsync(
      `UPDATE comptes_cafeteria SET remoteId = ?, tableOuNom = ?, statut = ?, ouvertPar = ?, ouvertLe = ?, fermeLe = ?, updatedAt = ?, syncVersion = ? WHERE id = ?`,
      [brute.id, brute.tableOuNom, brute.statut, brute.ouvertPar, brute.ouvertLe, brute.fermeLe, brute.updatedAt, brute.syncVersion, existant.id]
    );
  } else {
    await db.runAsync(
      `INSERT INTO comptes_cafeteria (id, remoteId, tableOuNom, statut, ouvertPar, ouvertLe, fermeLe, updatedAt, syncVersion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [brute.id, brute.id, brute.tableOuNom, brute.statut, brute.ouvertPar, brute.ouvertLe, brute.fermeLe, brute.updatedAt, brute.syncVersion]
    );
  }
}

async function upsertSousCompte(db: Awaited<ReturnType<typeof obtenirBase>>, brute: SousCompteBrute): Promise<void> {
  const existant = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM sous_comptes WHERE remoteId = ? OR id = ?",
    [brute.id, brute.id]
  );
  if (existant) {
    await db.runAsync(
      `UPDATE sous_comptes SET remoteId = ?, compteId = ?, nom = ?, updatedAt = ?, syncVersion = ? WHERE id = ?`,
      [brute.id, brute.compteId, brute.nom, brute.updatedAt, brute.syncVersion, existant.id]
    );
  } else {
    await db.runAsync(
      `INSERT INTO sous_comptes (id, remoteId, compteId, nom, updatedAt, syncVersion) VALUES (?, ?, ?, ?, ?, ?)`,
      [brute.id, brute.id, brute.compteId, brute.nom, brute.updatedAt, brute.syncVersion]
    );
  }
}

async function upsertLigneCommande(db: Awaited<ReturnType<typeof obtenirBase>>, brute: LigneCommandeBrute): Promise<void> {
  const existant = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM lignes_commande WHERE remoteId = ? OR id = ?",
    [brute.id, brute.id]
  );
  if (existant) {
    await db.runAsync(
      `UPDATE lignes_commande SET remoteId = ?, sousCompteId = ?, produitId = ?, quantite = ?, prixUnitaire = ?, devise = ?, createdAt = ?, updatedAt = ?, syncVersion = ? WHERE id = ?`,
      [brute.id, brute.sousCompteId, brute.produitId, brute.quantite, brute.prixUnitaire, brute.devise, brute.createdAt, brute.updatedAt, brute.syncVersion, existant.id]
    );
  } else {
    await db.runAsync(
      `INSERT INTO lignes_commande (id, remoteId, sousCompteId, produitId, quantite, prixUnitaire, devise, createdAt, updatedAt, syncVersion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [brute.id, brute.id, brute.sousCompteId, brute.produitId, brute.quantite, brute.prixUnitaire, brute.devise, brute.createdAt, brute.updatedAt, brute.syncVersion]
    );
  }
}
