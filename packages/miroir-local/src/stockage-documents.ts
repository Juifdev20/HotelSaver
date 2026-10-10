import type { EntitePull, EntitePush } from "@hotel-chicago/api-client";
import type { ConflitSync, LigneFileAttente, StockageLocal } from "@hotel-chicago/sync-engine";
import { MagasinDocuments, type OperationMagasin } from "./magasin";
import { CLES_REFERENCE, reecrireReferences, uuid } from "./references";

export const FILE = "_file";
export const CONFLITS = "_conflits";
export const META = "_meta";
export const ALIAS = "_alias";

/** Collections miroir (une par type d'entité tiré du serveur). */
export const COLLECTIONS_MIROIR: readonly EntitePull[] = [
  "Chambre", "Reservation", "Client", "Produit", "MouvementStock", "CompteCafeteria", "SousCompte", "LigneCommande", "Depense", "Facture", "VenteCafeteria",
];

interface LigneFile extends LigneFileAttente {
  /** Rang d'insertion : la file est rejouée dans l'ordre exact des actions. */
  ordre: number;
}

/**
 * `StockageLocal` du moteur de synchronisation, au-dessus de la base de documents. Comme sur mobile, une ligne créée hors ligne a
 * d'abord un identifiant LOCAL ; quand le serveur confirme, elle est RENOMMÉE sous son identifiant serveur et toutes les références
 * (réservation → client, ligne → sous-compte…, y compris dans la file) suivent, dans UNE écriture atomique. L'ancien identifiant
 * reste résoluble (table d'alias) pour un écran resté ouvert dessus.
 */
export class StockageDocuments implements StockageLocal {
  /**
   * @param seuilEchec nombre de refus du serveur après lequel une action est « échouée » : elle ne bloque plus la mise à jour
   *   des lignes qu'elle touchait (le serveur a dit non, c'est sa version qui fait foi). Doit valoir SEUIL_ECHEC_DEFINITIF du moteur.
   */
  constructor(
    readonly magasin: MagasinDocuments,
    private readonly seuilEchec = 3
  ) {}

  // ------------------------------------------------------------------ meta
  lireMeta<T = unknown>(cle: string): T | undefined {
    return this.magasin.obtenir<{ id: string; valeur: T }>(META, cle)?.valeur;
  }

  ecrireMeta(cle: string, valeur: unknown): Promise<void> {
    return this.magasin.ecrire(META, { id: cle, valeur });
  }

  // ------------------------------------------------------------------ file d'attente
  private lignesFile(): LigneFile[] {
    return this.magasin.lister<LigneFile>(FILE).sort((a, b) => a.ordre - b.ordre);
  }

  async listerFileAttente(): Promise<LigneFileAttente[]> {
    return this.lignesFile().map(({ ordre: _ordre, ...ligne }) => ligne);
  }

  async ajouterFileAttente(ligne: Omit<LigneFileAttente, "id" | "createdAt" | "attempts" | "lastError">): Promise<LigneFileAttente> {
    const ordre = (this.lireMeta<number>("compteurFile") ?? 0) + 1;
    const complete: LigneFile = { ...ligne, id: uuid(), createdAt: new Date().toISOString(), attempts: 0, ordre };
    await this.magasin.appliquer([
      { type: "ecrire", collection: FILE, id: complete.id, valeur: complete },
      { type: "ecrire", collection: META, id: "compteurFile", valeur: { id: "compteurFile", valeur: ordre } },
    ]);
    const { ordre: _o, ...publique } = complete;
    return publique;
  }

  /**
   * Enregistre, en UNE transaction, les écritures locales d'une action ET son entrée dans la file d'envoi : on ne peut jamais
   * avoir une vente visible à l'écran sans l'ordre qui l'enverra au serveur (ni l'inverse), même si l'application s'arrête au
   * milieu.
   */
  async enregistrerAction(ecritures: OperationMagasin[], operation?: Omit<LigneFileAttente, "id" | "createdAt" | "attempts" | "lastError">): Promise<void> {
    const ops = [...ecritures];
    if (operation) {
      const ordre = (this.lireMeta<number>("compteurFile") ?? 0) + 1;
      const ligne: LigneFile = { ...operation, id: uuid(), createdAt: new Date().toISOString(), attempts: 0, ordre };
      ops.push({ type: "ecrire", collection: FILE, id: ligne.id, valeur: ligne });
      ops.push({ type: "ecrire", collection: META, id: "compteurFile", valeur: { id: "compteurFile", valeur: ordre } });
    }
    await this.magasin.appliquer(ops);
  }

  async retirerFileAttente(id: string): Promise<void> {
    await this.magasin.supprimer(FILE, id);
  }

  async marquerEchecFileAttente(id: string, erreur: string): Promise<void> {
    const ligne = this.magasin.obtenir<LigneFile>(FILE, id);
    if (!ligne) return;
    await this.magasin.ecrire(FILE, { ...ligne, attempts: ligne.attempts + 1, lastError: erreur });
  }

  async idsEnAttente(entiteType: EntitePush): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const l of this.lignesFile()) {
      if (l.attempts >= this.seuilEchec) continue; // refusée par le serveur : sa version fait foi, plus rien à protéger
      if (l.entiteType === entiteType) ids.add(l.remoteId ?? l.localId);
      for (const t of l.touche ?? []) if (t.entiteType === entiteType) ids.add(t.id);
    }
    return ids;
  }

  // ------------------------------------------------------------------ conflits
  async ajouterConflit(conflit: Omit<ConflitSync, "id" | "createdAt">): Promise<void> {
    const complet: ConflitSync = { ...conflit, id: uuid(), createdAt: new Date().toISOString() };
    await this.magasin.ecrire(CONFLITS, complet);
  }

  async listerConflits(): Promise<ConflitSync[]> {
    return this.magasin.lister<ConflitSync>(CONFLITS).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async supprimerConflit(id: string): Promise<void> {
    await this.magasin.supprimer(CONFLITS, id);
  }

  // ------------------------------------------------------------------ curseurs de pull
  async lireDernierePull(entiteType: EntitePull): Promise<string | null> {
    return this.lireMeta<string>(`dernierePull:${entiteType}`) ?? null;
  }

  async ecrireDernierePull(entiteType: EntitePull, horodatage: string): Promise<void> {
    await this.ecrireMeta(`dernierePull:${entiteType}`, horodatage);
  }

  // ------------------------------------------------------------------ miroir
  async appliquerLignesServeur(entiteType: EntitePull, lignes: unknown[]): Promise<void> {
    const ops: OperationMagasin[] = [];
    for (const brute of lignes as { id: string; syncVersion?: number; updatedAt?: string }[]) {
      if (!brute || typeof brute.id !== "string") continue;
      const existante = this.magasin.obtenir<{ syncVersion?: number; updatedAt?: string }>(entiteType, brute.id);
      if (existante) {
        const vExistante = existante.syncVersion ?? 0;
        const vRecue = brute.syncVersion ?? 0;
        if (vExistante > vRecue) continue; // ligne plus récente déjà là (relecture d'une page ancienne)
        if (vExistante === vRecue && existante.updatedAt === brute.updatedAt) continue; // identique : pas d'écriture inutile
      }
      ops.push({ type: "ecrire", collection: entiteType, id: brute.id, valeur: brute });
    }
    await this.magasin.appliquer(ops);
  }

  async supprimerLignesServeur(entiteType: EntitePull, ids: string[]): Promise<void> {
    const enFile = new Set<string>();
    for (const l of this.lignesFile()) {
      enFile.add(l.localId);
      if (l.remoteId) enFile.add(l.remoteId);
    }
    await this.magasin.appliquer(
      ids.filter((id) => !enFile.has(id) && this.magasin.obtenir(entiteType, id)).map((id): OperationMagasin => ({ type: "supprimer", collection: entiteType, id }))
    );
  }

  async confirmerPush(entiteType: EntitePull, localId: string, remoteId: string, syncVersion: number): Promise<void> {
    if (localId === remoteId) {
      const ops: OperationMagasin[] = [];
      const doc = this.magasin.obtenir<Record<string, any>>(entiteType, localId);
      if (doc && doc.syncVersion !== syncVersion) ops.push({ type: "ecrire", collection: entiteType, id: localId, valeur: { ...doc, id: localId, syncVersion } });
      // Les modifications suivantes de cette ligne, faites sur celle qui vient d'être confirmée, repartent de la nouvelle version
      // (sinon elles passeraient pour des conflits avec nous-mêmes).
      for (const l of this.lignesFile()) {
        if (l.entiteType === entiteType && l.operation === "UPDATE" && l.remoteId === remoteId && l.baseSyncVersion !== undefined && l.baseSyncVersion < syncVersion) {
          ops.push({ type: "ecrire", collection: FILE, id: l.id, valeur: { ...l, baseSyncVersion: syncVersion } });
        }
      }
      await this.magasin.appliquer(ops);
      return;
    }
    const ops: OperationMagasin[] = [];
    const local = this.magasin.obtenir<Record<string, any>>(entiteType, localId);
    if (local) {
      // Le serveur a déjà pu envoyer cette même ligne sous son vrai identifiant (réponse perdue puis rejeu) : on garde
      // une seule ligne, celle du serveur, enrichie de ce que le poste connaissait.
      const serveur = this.magasin.obtenir<Record<string, any>>(entiteType, remoteId);
      const fusion = serveur ? { ...local, ...serveur, id: remoteId } : { ...local, id: remoteId, syncVersion };
      ops.push({ type: "supprimer", collection: entiteType, id: localId });
      ops.push({ type: "ecrire", collection: entiteType, id: remoteId, valeur: fusion });
    }
    ops.push({ type: "ecrire", collection: ALIAS, id: localId, valeur: { id: localId, vers: remoteId } });

    // Toutes les références à l'ancien identifiant : documents miroir…
    for (const collection of COLLECTIONS_MIROIR) {
      for (const doc of this.magasin.lister<Record<string, any>>(collection)) {
        if (collection === entiteType && doc.id === localId) continue;
        const maj = reecrireReferences(doc, localId, remoteId);
        if (maj) ops.push({ type: "ecrire", collection, id: doc.id, valeur: maj });
      }
    }
    // …et file d'attente (actions pas encore envoyées qui citent cette ligne).
    for (const l of this.lignesFile()) {
      let copie: LigneFile | null = null;
      const payload = reecrireReferences(l.payload, localId, remoteId);
      if (payload) copie = { ...l, payload };
      if (l.remoteId === localId) copie = { ...(copie ?? l), remoteId };
      if (l.touche?.some((t) => t.entiteType === entiteType && t.id === localId)) {
        copie = { ...(copie ?? l), touche: l.touche.map((t) => (t.entiteType === entiteType && t.id === localId ? { ...t, id: remoteId } : t)) };
      }
      if (copie) ops.push({ type: "ecrire", collection: FILE, id: l.id, valeur: copie });
    }
    await this.magasin.appliquer(ops);
  }

  async appliquerResolutionConflit(entiteType: string, donneesServeur: unknown): Promise<void> {
    const ligne = donneesServeur as { id?: string } | null;
    if (!ligne?.id || !COLLECTIONS_MIROIR.includes(entiteType as EntitePull)) return;
    await this.magasin.ecrire(entiteType, { ...ligne, id: ligne.id });
  }

  /**
   * Abandonne une action que le serveur a refusée (ou que la personne retire) : ce qu'elle avait créé localement disparaît, ce
   * qu'elle avait modifié est relu auprès du serveur, et les actions suivantes qui en dépendaient sont retirées avec elle (sans
   * quoi elles seraient refusées à leur tour). Renvoie les actions retirées, pour information.
   */
  async abandonnerOperation(id: string): Promise<LigneFileAttente[]> {
    const toutes = this.lignesFile();
    const depart = toutes.find((l) => l.id === id);
    if (!depart) return [];
    const retirees: LigneFile[] = [];
    const idsAbandonnes = new Set<string>();
    const ops: OperationMagasin[] = [];
    const aTraiter: LigneFile[] = [depart];
    while (aTraiter.length > 0) {
      const l = aTraiter.pop()!;
      if (retirees.some((x) => x.id === l.id)) continue;
      retirees.push(l);
      ops.push({ type: "supprimer", collection: FILE, id: l.id });
      if (l.operation === "CREATE") {
        const p = l.payload as Record<string, unknown>;
        const cree = [l.localId, ...(Array.isArray(p.ventesLocalIds) ? (p.ventesLocalIds as string[]) : []), p.clientLocalId, p.premierSousCompteLocalId].filter((x): x is string => typeof x === "string");
        for (const c of cree) idsAbandonnes.add(c);
        for (const collection of COLLECTIONS_MIROIR) for (const c of cree) if (this.magasin.obtenir(collection, c)) ops.push({ type: "supprimer", collection, id: c });
        // Les lignes rattachées à ce qui vient d'être supprimé (lignes d'un compte créé hors ligne…).
        for (const collection of COLLECTIONS_MIROIR) {
          for (const doc of this.magasin.lister<Record<string, any>>(collection)) {
            if (CLES_REFERENCE.some((cle) => typeof doc[cle] === "string" && idsAbandonnes.has(doc[cle]))) ops.push({ type: "supprimer", collection, id: doc.id });
          }
        }
      }
      // Actions suivantes qui citent ce qui est abandonné.
      for (const suivante of toutes) {
        if (suivante.id === l.id || retirees.some((x) => x.id === suivante.id)) continue;
        const refs = [suivante.remoteId, ...CLES_REFERENCE.map((cle) => (suivante.payload as Record<string, unknown>)[cle])].filter((x): x is string => typeof x === "string");
        if (refs.some((r) => idsAbandonnes.has(r))) aTraiter.push(suivante);
      }
    }
    // Ce que ces actions avaient modifié localement est relu auprès du serveur au prochain cycle (curseur ramené à l'origine : les
    // lignes identiques côté version ne sont pas réécrites, seules celles que l'action avait changées le sont).
    const types = new Set<EntitePull>();
    for (const l of retirees) {
      if (COLLECTIONS_MIROIR.includes(l.entiteType as EntitePull)) types.add(l.entiteType as EntitePull);
      for (const t of l.touche ?? []) types.add(t.entiteType);
    }
    for (const t of types) ops.push({ type: "ecrire", collection: META, id: `dernierePull:${t}`, valeur: { id: `dernierePull:${t}`, valeur: new Date(0).toISOString() } });
    await this.magasin.appliquer(ops);
    return retirees.map(({ ordre: _o, ...ligne }) => ligne);
  }

  // ------------------------------------------------------------------ aides pour les lectures / écritures locales
  /** Identifiant actuel d'une ligne : suit les renommages local → serveur. */
  resoudreAlias(id: string): string {
    let courant = id;
    for (let i = 0; i < 5; i++) {
      const alias = this.magasin.obtenir<{ vers: string }>(ALIAS, courant);
      if (!alias) break;
      courant = alias.vers;
    }
    return courant;
  }

  /** Une ligne du miroir, par son identifiant actuel ou ancien. */
  obtenir<T = any>(entiteType: EntitePull, id: string): T | undefined {
    return this.magasin.obtenir<T>(entiteType, id) ?? this.magasin.obtenir<T>(entiteType, this.resoudreAlias(id));
  }

  lister<T = any>(entiteType: EntitePull): T[] {
    return this.magasin.lister<T>(entiteType);
  }
}
