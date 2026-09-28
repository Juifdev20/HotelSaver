import type { EntitePull, EntitePush } from "@hotel-chicago/api-client";

/** Une opération en attente d'envoi, persistée AVANT toute tentative réseau
 * (jamais seulement en mémoire) pour survivre à un kill de l'app en plein
 * envoi — voir StockageLocal.ajouterFileAttente. */
export interface LigneFileAttente {
  /** Identifiant local de la ligne de file elle-même (pas de l'entité). */
  id: string;
  entiteType: EntitePush;
  localId: string;
  remoteId?: string;
  operation: "CREATE" | "UPDATE";
  payload: Record<string, unknown>;
  /** Requis pour UPDATE : le `syncVersion` connu localement avant la
   * modification. Absent = pas encore de version serveur (CREATE). */
  baseSyncVersion?: number;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

/** Un conflit détecté par le serveur (syncVersion périmé) — jamais résolu
 * automatiquement, toujours affiché à l'utilisateur (section 10.4). */
export interface ConflitSync {
  id: string;
  entiteType: EntitePush;
  localId: string;
  remoteId?: string;
  monChangement: Record<string, unknown>;
  donneesServeur: unknown;
  createdAt: string;
}

export interface EtatSync {
  enLigne: boolean;
  enAttente: number;
  conflits: number;
  dernierePousseeLe: string | null;
  derniereErreur: string | null;
}

/**
 * Interface de stockage, indépendante du moteur réel (SQLite sur mobile,
 * potentiellement autre chose sur desktop plus tard). `MoteurSync` ne connaît
 * que cette interface.
 */
export interface StockageLocal {
  listerFileAttente(): Promise<LigneFileAttente[]>;
  ajouterFileAttente(
    ligne: Omit<LigneFileAttente, "id" | "createdAt" | "attempts" | "lastError">
  ): Promise<LigneFileAttente>;
  retirerFileAttente(id: string): Promise<void>;
  marquerEchecFileAttente(id: string, erreur: string): Promise<void>;

  ajouterConflit(conflit: Omit<ConflitSync, "id" | "createdAt">): Promise<void>;
  listerConflits(): Promise<ConflitSync[]>;
  supprimerConflit(id: string): Promise<void>;

  lireDernierePull(entiteType: EntitePull): Promise<string | null>;
  ecrireDernierePull(entiteType: EntitePull, horodatage: string): Promise<void>;

  /** ids (remoteId, ou localId si pas encore de remoteId) des entrées en
   * attente dans la file pour ce type — sert à ignorer les lignes tirées du
   * serveur qui seraient réconciliées de toute façon par la réponse du push
   * (anti-écrasement, voir MoteurSync). */
  idsEnAttente(entiteType: EntitePush): Promise<Set<string>>;

  /** Applique des lignes reçues du serveur dans le miroir local de cette
   * entité (upsert par id). */
  appliquerLignesServeur(entiteType: EntitePull, lignes: unknown[]): Promise<void>;

  /** Après un push SYNCED : reporter le nouveau `syncVersion` (et le
   * `remoteId` si c'était une création) dans le miroir local. EntitePull
   * (pas EntitePush) : les enfants renvoyés par un CREATE parent peuvent
   * être des entités non poussables directement (Client inline d'une
   * Reservation, Phase 16). */
  confirmerPush(entiteType: EntitePull, localId: string, remoteId: string, syncVersion: number): Promise<void>;

  /** L'utilisateur choisit de garder la version serveur pour un conflit :
   * écrire `donneesServeur` dans le miroir. Indispensable — sans ça, la
   * prochaine modification réutilise un `baseSyncVersion` périmé et
   * re-conflicte aussitôt. */
  appliquerResolutionConflit(entiteType: EntitePush, donneesServeur: unknown): Promise<void>;
}
