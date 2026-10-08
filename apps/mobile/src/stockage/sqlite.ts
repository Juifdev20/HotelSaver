import * as SQLite from "expo-sqlite";

/**
 * Base partagée par tout l'appareil (pas par profil) : les Chambres sont une
 * vérité commune à l'hôtel, pas des données propres à un utilisateur — voir
 * DECISIONS.md.
 */
const NOM_BASE = "hotelchicago.db";

let promesseBase: Promise<SQLite.SQLiteDatabase> | null = null;

export function obtenirBase(): Promise<SQLite.SQLiteDatabase> {
  if (!promesseBase) {
    promesseBase = SQLite.openDatabaseAsync(NOM_BASE).then(async (db) => {
      await creerSchema(db);
      return db;
    });
  }
  return promesseBase;
}

async function creerSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS chambres (
      id TEXT PRIMARY KEY,
      numero TEXT NOT NULL,
      type TEXT NOT NULL,
      prixParNuit TEXT NOT NULL,
      devise TEXT NOT NULL,
      statut TEXT NOT NULL,
      photos TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      syncVersion INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entiteType TEXT NOT NULL,
      localId TEXT NOT NULL,
      remoteId TEXT,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      baseSyncVersion INTEGER,
      createdAt TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      lastError TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY,
      entiteType TEXT NOT NULL,
      localId TEXT NOT NULL,
      remoteId TEXT,
      monChangement TEXT NOT NULL,
      donneesServeur TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      cle TEXT PRIMARY KEY,
      valeur TEXT NOT NULL
    );

    -- Tables miroir Cafétaria (Phase 6, 26/09/2026) : contrairement à
    -- "chambres", ce sont des CREATE (compte/sous-compte/ligne n'existent pas
    -- encore côté serveur au moment de l'écriture optimiste) — "id" est donc
    -- l'id LOCAL stable, jamais renommé, et "remoteId" est rempli une fois la
    -- création confirmée par le serveur. Voir cafeteriaMirroir.ts.
    CREATE TABLE IF NOT EXISTS produits (
      id TEXT PRIMARY KEY,
      nom TEXT NOT NULL,
      categorie TEXT NOT NULL,
      prix TEXT NOT NULL,
      devise TEXT NOT NULL,
      prixAchat TEXT,
      photo TEXT,
      stockActuel TEXT NOT NULL,
      seuilAlerte TEXT NOT NULL,
      actif INTEGER NOT NULL,
      commandableEnLigne INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      typeProduit TEXT NOT NULL DEFAULT 'ARTICLE',
      portionsDisponibles INTEGER,
      updatedAt TEXT NOT NULL,
      syncVersion INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comptes_cafeteria (
      id TEXT PRIMARY KEY,
      remoteId TEXT,
      tableOuNom TEXT NOT NULL,
      statut TEXT NOT NULL,
      origine TEXT,
      contactClient TEXT,
      noteClient TEXT,
      ouvertPar TEXT NOT NULL,
      ouvertLe TEXT NOT NULL,
      fermeLe TEXT,
      updatedAt TEXT NOT NULL,
      syncVersion INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sous_comptes (
      id TEXT PRIMARY KEY,
      remoteId TEXT,
      compteId TEXT NOT NULL,
      nom TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      syncVersion INTEGER NOT NULL,
      payeLe TEXT
    );

    CREATE TABLE IF NOT EXISTS lignes_commande (
      id TEXT PRIMARY KEY,
      remoteId TEXT,
      sousCompteId TEXT NOT NULL,
      produitId TEXT NOT NULL,
      quantite TEXT NOT NULL,
      prixUnitaire TEXT NOT NULL,
      devise TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'EN_ATTENTE',
      prisEnChargeA TEXT,
      pretA TEXT,
      note TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      syncVersion INTEGER NOT NULL
    );

    -- Tables miroir Réception (Phase 16) : même convention que la Cafétaria —
    -- "id" est l'id LOCAL stable (jamais renommé), "remoteId" l'id serveur
    -- une fois la création confirmée. "clients" sert aussi au picker
    -- « client existant » hors ligne ; les lignes tirées du serveur ont
    -- id = remoteId dès l'insertion (voir upsertClient/upsertReservation).
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      remoteId TEXT,
      nom TEXT NOT NULL,
      telephone TEXT,
      email TEXT,
      typePiece TEXT,
      numeroPiece TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      syncVersion INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      remoteId TEXT,
      chambreId TEXT NOT NULL,
      clientId TEXT NOT NULL,
      dateArrivee TEXT NOT NULL,
      dateDepart TEXT NOT NULL,
      acompte TEXT NOT NULL,
      statut TEXT NOT NULL,
      origine TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      note TEXT,
      annuleLe TEXT,
      motifAnnulation TEXT,
      updatedAt TEXT NOT NULL,
      syncVersion INTEGER NOT NULL
    );

    -- Dépenses du département (07/10/2026) : id local stable, remoteId
    -- renseigné après le push (même principe que reservations).
    CREATE TABLE IF NOT EXISTS depenses (
      id TEXT PRIMARY KEY,
      remoteId TEXT,
      departement TEXT NOT NULL,
      date TEXT NOT NULL,
      motif TEXT NOT NULL,
      montant TEXT NOT NULL,
      devise TEXT NOT NULL,
      creeParId TEXT NOT NULL,
      creeParNom TEXT NOT NULL,
      annulee INTEGER NOT NULL DEFAULT 0,
      annuleeLe TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      syncVersion INTEGER NOT NULL
    );
  `);

  // Évolutions de schéma pour les téléphones déjà installés (CREATE TABLE IF NOT EXISTS ne modifie
  // pas une table existante) : colonne ajoutée seulement si elle manque.
  const colonnes = await db.getAllAsync<{ name: string }>("PRAGMA table_info(sous_comptes)", []);
  if (!colonnes.some((c) => c.name === "payeLe")) {
    await db.execAsync("ALTER TABLE sous_comptes ADD COLUMN payeLe TEXT");
  }

  async function ajouterColonneSiAbsente(table: string, colonne: string, ddl: string) {
    const infos = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`, []);
    if (!infos.some((c) => c.name === colonne)) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  }
  // Cuisine (cycle de vie des lignes) et prix d'achat produit — ajoutés
  // après la première installation du miroir.
  await ajouterColonneSiAbsente("lignes_commande", "statut", "statut TEXT NOT NULL DEFAULT 'EN_ATTENTE'");
  await ajouterColonneSiAbsente("lignes_commande", "prisEnChargeA", "prisEnChargeA TEXT");
  await ajouterColonneSiAbsente("lignes_commande", "pretA", "pretA TEXT");
  await ajouterColonneSiAbsente("lignes_commande", "note", "note TEXT");
  await ajouterColonneSiAbsente("produits", "prixAchat", "prixAchat TEXT");
  // Commande en ligne depuis le site public : carte opt-in par produit et
  // origine/contact du client sur les comptes (commandes SITE_PUBLIC).
  await ajouterColonneSiAbsente("produits", "commandableEnLigne", "commandableEnLigne INTEGER NOT NULL DEFAULT 0");
  await ajouterColonneSiAbsente("produits", "description", "description TEXT");
  // Type de produit : PLAT = préparé (site/cuisine, sans stock), ARTICLE =
  // comptoir stocké — défaut ARTICLE comme en base serveur.
  await ajouterColonneSiAbsente("produits", "typeProduit", "typeProduit TEXT NOT NULL DEFAULT 'ARTICLE'");
  // Portions limitées d'un plat (NULL = illimité).
  await ajouterColonneSiAbsente("produits", "portionsDisponibles", "portionsDisponibles INTEGER");
  // Code-barres des articles (scan à la caisse, 08/10/2026).
  await ajouterColonneSiAbsente("produits", "codeBarres", "codeBarres TEXT");
  await ajouterColonneSiAbsente("comptes_cafeteria", "origine", "origine TEXT");
  await ajouterColonneSiAbsente("comptes_cafeteria", "contactClient", "contactClient TEXT");
  await ajouterColonneSiAbsente("comptes_cafeteria", "noteClient", "noteClient TEXT");
  // Réception moderne : demandes spéciales sur réservation, registre de
  // police (pièce d'identité) et notes libres sur la fiche client.
  await ajouterColonneSiAbsente("reservations", "note", "note TEXT");
  await ajouterColonneSiAbsente("clients", "typePiece", "typePiece TEXT");
  await ajouterColonneSiAbsente("clients", "numeroPiece", "numeroPiece TEXT");
  await ajouterColonneSiAbsente("clients", "notes", "notes TEXT");
  // Suivi client depuis le site + pré-enregistrement en ligne (07/10/2026).
  await ajouterColonneSiAbsente("reservations", "jetonSuivi", "jetonSuivi TEXT");
  await ajouterColonneSiAbsente("reservations", "heureArriveePrevue", "heureArriveePrevue TEXT");
  await ajouterColonneSiAbsente("reservations", "demandeClient", "demandeClient TEXT");
  await ajouterColonneSiAbsente("reservations", "preEnregistreLe", "preEnregistreLe TEXT");
  await ajouterColonneSiAbsente("reservations", "reponseReception", "reponseReception TEXT");
}
