import { randomUUID } from "expo-crypto";
import { CompteCafeteria, Devise, LigneCommande, Produit, SousCompte, StatutCompte } from "@hotel-chicago/types";
import { obtenirBase } from "./sqlite";

/**
 * `remoteId` n'existe que dans le miroir mobile (jamais dans
 * @hotel-chicago/types, un concept purement interne à la synchronisation
 * hors ligne) : l'id réel côté serveur une fois la création confirmée, ou
 * `null` tant que l'opération est encore en file. Nécessaire pour tout appel
 * API direct qui a besoin du vrai id (ex. `encaisser`, resté en ligne — voir
 * le plan) alors que l'écran continue de désigner ce compte par son id local
 * stable. Voir aussi `idsEnAttente` (MoteurSync) pour savoir si l'un des ids
 * ci-dessous est encore en attente.
 */
export interface SousCompteMiroir extends SousCompte {
  remoteId: string | null;
}
export interface CompteCafeteriaMiroir extends CompteCafeteria {
  remoteId: string | null;
  sousComptes: SousCompteMiroir[];
}

interface CompteLigneBrute {
  id: string;
  remoteId: string | null;
  tableOuNom: string;
  statut: string;
  ouvertPar: string;
  ouvertLe: string;
  fermeLe: string | null;
  updatedAt: string;
  syncVersion: number;
}

interface SousCompteLigneBrute {
  id: string;
  remoteId: string | null;
  compteId: string;
  nom: string;
  payeLe: string | null;
  updatedAt: string;
  syncVersion: number;
}

interface LigneCommandeLigneBrute {
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

interface ProduitLigneBrute {
  id: string;
  nom: string;
  categorie: string;
  prix: string;
  devise: string;
  photo: string | null;
  stockActuel: string;
  seuilAlerte: string;
  actif: number;
  updatedAt: string;
  syncVersion: number;
}

function produitDepuisBrut(brut: ProduitLigneBrute): Produit {
  return { ...brut, devise: brut.devise as Devise, actif: brut.actif === 1 };
}

/** Reconstruit la forme imbriquée CompteCafeteria.sousComptes[].lignes[].produit
 * en joignant les tables miroir côté client — GET /sync/pull ne renvoie que
 * des lignes plates, sans `include` (voir apps/api/src/sync/sync.service.ts). */
async function assemblerComptes(db: Awaited<ReturnType<typeof obtenirBase>>, comptesBruts: CompteLigneBrute[]): Promise<CompteCafeteriaMiroir[]> {
  if (comptesBruts.length === 0) return [];

  const [sousComptesBruts, lignesBrutes, produitsBruts] = await Promise.all([
    db.getAllAsync<SousCompteLigneBrute>("SELECT * FROM sous_comptes", []),
    db.getAllAsync<LigneCommandeLigneBrute>("SELECT * FROM lignes_commande", []),
    db.getAllAsync<ProduitLigneBrute>("SELECT * FROM produits", []),
  ]);

  const produitsParId = new Map(produitsBruts.map((p) => [p.id, produitDepuisBrut(p)]));
  const lignesParSousCompte = new Map<string, LigneCommande[]>();
  for (const brut of lignesBrutes) {
    const produit = produitsParId.get(brut.produitId);
    if (!produit) continue; // Produit pas encore synchronisé localement — ne devrait pas arriver (Produit pull avant Cafétaria).
    const ligne: LigneCommande = {
      id: brut.id,
      sousCompteId: brut.sousCompteId,
      produitId: brut.produitId,
      quantite: brut.quantite,
      prixUnitaire: brut.prixUnitaire,
      devise: brut.devise as Devise,
      produit,
    };
    const liste = lignesParSousCompte.get(brut.sousCompteId) ?? [];
    liste.push(ligne);
    lignesParSousCompte.set(brut.sousCompteId, liste);
  }

  const sousComptesParCompte = new Map<string, SousCompteMiroir[]>();
  for (const brut of sousComptesBruts) {
    // Les lignes tirées du serveur référencent le sous-compte par son id
    // serveur (remoteId), les lignes créées localement par son id local :
    // on joint les deux.
    const lignes = [
      ...(lignesParSousCompte.get(brut.id) ?? []),
      ...(brut.remoteId && brut.remoteId !== brut.id ? lignesParSousCompte.get(brut.remoteId) ?? [] : []),
    ];
    const sousCompte: SousCompteMiroir = {
      id: brut.id,
      remoteId: brut.remoteId,
      compteId: brut.compteId,
      nom: brut.nom,
      payeLe: brut.payeLe ?? null,
      lignes,
    };
    const liste = sousComptesParCompte.get(brut.compteId) ?? [];
    liste.push(sousCompte);
    sousComptesParCompte.set(brut.compteId, liste);
  }

  return comptesBruts.map((brut) => {
    // Pareil côté compte : un sous-compte tiré du serveur connaît le compte
    // par son id serveur, un sous-compte créé localement par son id local.
    const sousComptes = [
      ...(sousComptesParCompte.get(brut.id) ?? []),
      ...(brut.remoteId && brut.remoteId !== brut.id ? sousComptesParCompte.get(brut.remoteId) ?? [] : []),
    ];
    return {
      id: brut.id,
      remoteId: brut.remoteId,
      tableOuNom: brut.tableOuNom,
      statut: brut.statut as StatutCompte,
      ouvertPar: brut.ouvertPar,
      ouvertLe: brut.ouvertLe,
      fermeLe: brut.fermeLe,
      syncVersion: brut.syncVersion,
      sousComptes,
      // Les ventes ne sont pas mirrorées dans cette passe (encaissement
      // toujours en ligne, voir le plan) — jamais affichées depuis le miroir.
      ventes: [],
    };
  });
}

/** Lecture instantanée du miroir local — jamais un appel réseau (voir
 * EcranComptesOuverts.tsx). */
export async function listerComptesOuvertsMiroir(): Promise<CompteCafeteriaMiroir[]> {
  const db = await obtenirBase();
  const comptesBruts = await db.getAllAsync<CompteLigneBrute>(
    "SELECT * FROM comptes_cafeteria WHERE statut = ? ORDER BY ouvertLe DESC",
    [StatutCompte.OUVERT]
  );
  return assemblerComptes(db, comptesBruts);
}

/** `id` accepte aussi bien un id local (compte pas encore synchronisé) qu'un
 * id serveur (compte connu via pull, ou déjà confirmé) — les deux cohabitent
 * comme clé primaire de `comptes_cafeteria` (voir le plan : id local jamais
 * renommé). */
export async function obtenirCompteMiroir(id: string): Promise<CompteCafeteriaMiroir | null> {
  const db = await obtenirBase();
  const compteBrut = await db.getFirstAsync<CompteLigneBrute>("SELECT * FROM comptes_cafeteria WHERE id = ?", [id]);
  if (!compteBrut) return null;
  const [compte] = await assemblerComptes(db, [compteBrut]);
  return compte;
}

export async function listerProduitsMiroir(): Promise<Produit[]> {
  const db = await obtenirBase();
  const produitsBruts = await db.getAllAsync<ProduitLigneBrute>("SELECT * FROM produits WHERE actif = 1 ORDER BY nom ASC", []);
  return produitsBruts.map(produitDepuisBrut);
}

/** Écriture optimiste : ouvre un compte + son premier sous-compte
 * instantanément en local (id stable, jamais renommé — voir le plan),
 * l'appelant met ensuite l'opération CompteCafeteria en file
 * (`moteurSync.mettreEnFile`). Retourne le compte tel qu'il doit s'afficher
 * immédiatement, avant toute confirmation réseau. */
export async function creerCompteLocal(tableOuNom: string, nomPremierSousCompte?: string): Promise<CompteCafeteriaMiroir> {
  const db = await obtenirBase();
  const idCompte = randomUUID();
  const idSousCompte = randomUUID();
  const maintenant = new Date().toISOString();
  const nomSousCompte = nomPremierSousCompte?.trim() || "Personne 1";

  await db.runAsync(
    `INSERT INTO comptes_cafeteria (id, remoteId, tableOuNom, statut, ouvertPar, ouvertLe, fermeLe, updatedAt, syncVersion)
     VALUES (?, NULL, ?, ?, '', ?, NULL, ?, 1)`,
    [idCompte, tableOuNom, StatutCompte.OUVERT, maintenant, maintenant]
  );
  await db.runAsync(
    `INSERT INTO sous_comptes (id, remoteId, compteId, nom, updatedAt, syncVersion) VALUES (?, NULL, ?, ?, ?, 1)`,
    [idSousCompte, idCompte, nomSousCompte, maintenant]
  );

  return {
    id: idCompte,
    remoteId: null,
    tableOuNom,
    statut: StatutCompte.OUVERT,
    ouvertPar: "",
    ouvertLe: maintenant,
    fermeLe: null,
    syncVersion: 1,
    sousComptes: [{ id: idSousCompte, remoteId: null, compteId: idCompte, nom: nomSousCompte, lignes: [] }],
    ventes: [],
  };
}

/** N'est appelé que pour un compte déjà confirmé synchronisé (voir le plan —
 * évite toute re-clé en cascade). `compteId` est donc toujours un id réel. */
export async function creerSousCompteLocal(compteId: string, nom: string): Promise<SousCompteMiroir> {
  const db = await obtenirBase();
  const id = randomUUID();
  const maintenant = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO sous_comptes (id, remoteId, compteId, nom, updatedAt, syncVersion) VALUES (?, NULL, ?, ?, ?, 1)`,
    [id, compteId, nom, maintenant]
  );
  return { id, remoteId: null, compteId, nom, lignes: [] };
}

/** Supprime une écriture optimiste locale annulée (voir EcranSynchronisation.tsx
 * — action retirée définitivement de la file, ex. stock insuffisant côté
 * serveur) : la ligne miroir correspondante ne verra jamais de confirmation
 * serveur, elle n'a donc plus lieu d'exister localement. */
export async function supprimerEcritureCafeteriaLocale(entiteType: string, localId: string): Promise<void> {
  const db = await obtenirBase();
  if (entiteType === "CompteCafeteria") {
    // En cascade sur les enfants du miroir, sinon ils resteraient orphelins.
    await db.runAsync(
      "DELETE FROM lignes_commande WHERE sousCompteId IN (SELECT id FROM sous_comptes WHERE compteId = ?)",
      [localId]
    );
    await db.runAsync("DELETE FROM sous_comptes WHERE compteId = ?", [localId]);
    await db.runAsync("DELETE FROM comptes_cafeteria WHERE id = ?", [localId]);
  } else if (entiteType === "SousCompte") {
    await db.runAsync("DELETE FROM lignes_commande WHERE sousCompteId = ?", [localId]);
    await db.runAsync("DELETE FROM sous_comptes WHERE id = ?", [localId]);
  } else if (entiteType === "LigneCommande") {
    await db.runAsync("DELETE FROM lignes_commande WHERE id = ?", [localId]);
  }
}

/** N'est appelé que pour un sous-compte déjà confirmé synchronisé (voir le
 * plan). Le prix/la devise sont une capture du produit au moment de la
 * commande (même règle que côté serveur, `ajouterLigne`) — le serveur
 * recalculera indépendamment à la synchronisation ; un écart (prix changé
 * entre-temps) se corrige silencieusement au pull suivant. */
export async function creerLigneLocal(sousCompteId: string, produit: Produit, quantite: number): Promise<LigneCommande> {
  const db = await obtenirBase();
  const id = randomUUID();
  const maintenant = new Date().toISOString();
  const quantiteTexte = String(quantite);
  await db.runAsync(
    `INSERT INTO lignes_commande (id, remoteId, sousCompteId, produitId, quantite, prixUnitaire, devise, createdAt, updatedAt, syncVersion)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [id, sousCompteId, produit.id, quantiteTexte, produit.prix, produit.devise, maintenant, maintenant]
  );
  return { id, sousCompteId, produitId: produit.id, quantite: quantiteTexte, prixUnitaire: produit.prix, devise: produit.devise, produit };
}

/**
 * Quantité ajoutée par produit depuis le début de la journée (heure de l'hôtel : Africa/Lubumbashi,
 * UTC+2 sans heure d'été), tous comptes confondus, y compris déjà encaissés — sert à mettre les
 * produits les plus demandés en tête de l'écran « Ajouter ». Lu dans le miroir : marche hors ligne.
 */
export async function produitsPopulairesAujourdhuiMiroir(maintenant: Date = new Date()): Promise<Map<string, number>> {
  const decalage = 2 * 60 * 60 * 1000;
  const jour = 24 * 60 * 60 * 1000;
  const local = maintenant.getTime() + decalage;
  const debut = new Date(local - (local % jour) - decalage).toISOString();
  const db = await obtenirBase();
  const lignes = await db.getAllAsync<{ produitId: string; total: number }>(
    "SELECT produitId, SUM(CAST(quantite AS REAL)) AS total FROM lignes_commande WHERE createdAt >= ? GROUP BY produitId",
    [debut]
  );
  return new Map(lignes.map((l) => [l.produitId, Number(l.total)]));
}

/** Marque une personne comme ayant réglé sa part dans le miroir, sans attendre le prochain pull. */
export async function marquerPersonnePayeeLocal(sousCompteId: string): Promise<void> {
  const db = await obtenirBase();
  await db.runAsync("UPDATE sous_comptes SET payeLe = ? WHERE id = ?", [new Date().toISOString(), sousCompteId]);
}
