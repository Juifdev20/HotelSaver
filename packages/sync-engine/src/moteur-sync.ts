import { ENTITES_PUSH, type ClientApi, type EntitePull, type EntitePush } from "@hotel-chicago/api-client";
import type { ConflitSync, EtatSync, StockageLocal } from "./types";

/** Section 10.2 : backoff exponentiel sur échec réseau (pas sur un simple
 * ERROR métier renvoyé dans un lot par ailleurs réussi — voir pousser()).
 * Réinitialisé dès qu'un ping de connexion ou un cycle réussit. */
const PALIERS_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 120_000];

/** Section 10.2 : détection de connectivité par ping périodique, pas
 * seulement l'état réseau du système. */
const INTERVALLE_PING_MS = 20_000;

const ENSEMBLE_ENTITES_PUSH: ReadonlySet<string> = new Set(ENTITES_PUSH);

function estPoussable(entite: EntitePull): entite is EntitePush {
  return ENSEMBLE_ENTITES_PUSH.has(entite);
}

/**
 * Orchestration pure de la synchronisation (aucune dépendance à SQLite ou à
 * React Native) : ping de connectivité, poussée de la file d'attente,
 * récupération des changements serveur, détection de conflit déléguée à
 * l'API (voir apps/api/src/sync/sync.service.ts — le serveur gagne toujours).
 * `StockageLocal` fournit la persistance réelle (mobile : SQLite).
 */
export class MoteurSync {
  private readonly ecouteurs = new Set<(etat: EtatSync) => void>();
  private etat: EtatSync = {
    enLigne: false,
    enAttente: 0,
    conflits: 0,
    dernierePousseeLe: null,
    derniereErreur: null,
  };
  private minuteur: ReturnType<typeof setInterval> | null = null;
  private cycleEnCours: Promise<void> | null = null;
  private palierBackoff = -1;
  private prochainEssaiAu = 0;

  constructor(
    private readonly client: ClientApi,
    private readonly stockage: StockageLocal,
    private readonly entitesPull: EntitePull[]
  ) {}

  demarrer(): void {
    if (this.minuteur) return;
    void this.rafraichirCompteurs();
    this.minuteur = setInterval(() => void this.cycle(), INTERVALLE_PING_MS);
    void this.cycle();
  }

  arreter(): void {
    if (this.minuteur) {
      clearInterval(this.minuteur);
      this.minuteur = null;
    }
  }

  onChangement(ecouteur: (etat: EtatSync) => void): () => void {
    this.ecouteurs.add(ecouteur);
    ecouteur(this.etat);
    return () => this.ecouteurs.delete(ecouteur);
  }

  etatActuel(): EtatSync {
    return this.etat;
  }

  /** Appelé par l'UI pour toute écriture pouvant se faire hors ligne. Écrit
   * en file avant toute tentative réseau, puis tente un push immédiat si en
   * ligne (sans bloquer l'appelant sur le résultat du push). */
  async mettreEnFile(operation: Parameters<StockageLocal["ajouterFileAttente"]>[0]): Promise<void> {
    await this.stockage.ajouterFileAttente(operation);
    await this.rafraichirCompteurs();
    void this.cycle();
  }

  /** Pull-to-refresh manuel : pousse la file puis tire les changements. */
  async forcerSynchronisation(): Promise<void> {
    await this.cycle();
  }

  async listerConflits(): Promise<ConflitSync[]> {
    return this.stockage.listerConflits();
  }

  async resoudreConflitGarderServeur(conflitId: string, entiteType: EntitePush, donneesServeur: unknown): Promise<void> {
    await this.stockage.appliquerResolutionConflit(entiteType, donneesServeur);
    await this.stockage.supprimerConflit(conflitId);
    await this.rafraichirCompteurs();
  }

  /** Un seul cycle à la fois : le poll minuteur, `forcerSynchronisation()` et
   * le push immédiat déclenché par `mettreEnFile` partagent ce verrou —
   * sinon deux séquences "tirer + appliquer + écrire l'horodatage" pourraient
   * s'entrelacer et laisser `sync_meta` incohérent avec ce qui a été appliqué. */
  private cycle(): Promise<void> {
    if (this.cycleEnCours) return this.cycleEnCours;
    this.cycleEnCours = this.executerCycle().finally(() => {
      this.cycleEnCours = null;
    });
    return this.cycleEnCours;
  }

  private async executerCycle(): Promise<void> {
    if (Date.now() < this.prochainEssaiAu) return;

    const enLigne = await this.client.estJoignable();
    if (!enLigne) {
      this.etat = { ...this.etat, enLigne: false };
      this.emettre();
      return;
    }
    this.palierBackoff = -1;

    try {
      await this.pousser();
      await this.tirer();
      this.etat = {
        ...this.etat,
        enLigne: true,
        derniereErreur: null,
        dernierePousseeLe: new Date().toISOString(),
      };
    } catch (erreur) {
      this.palierBackoff = Math.min(this.palierBackoff + 1, PALIERS_BACKOFF_MS.length - 1);
      this.prochainEssaiAu = Date.now() + PALIERS_BACKOFF_MS[this.palierBackoff];
      this.etat = {
        ...this.etat,
        enLigne: true,
        derniereErreur: erreur instanceof Error ? erreur.message : "Erreur de synchronisation.",
      };
    }
    await this.rafraichirCompteurs();
  }

  private async pousser(): Promise<void> {
    const file = await this.stockage.listerFileAttente();
    if (file.length === 0) return;

    const resultats = await this.client.syncPush(
      file.map((ligne) => ({
        entiteType: ligne.entiteType,
        localId: ligne.localId,
        remoteId: ligne.remoteId,
        operation: ligne.operation,
        payload: ligne.payload,
        baseSyncVersion: ligne.baseSyncVersion,
      }))
    );

    for (let i = 0; i < file.length; i++) {
      const ligne = file[i];
      const resultat = resultats[i];
      if (!resultat) continue;

      if (resultat.statut === "SYNCED") {
        await this.stockage.confirmerPush(
          ligne.entiteType,
          ligne.localId,
          resultat.remoteId ?? ligne.remoteId ?? ligne.localId,
          resultat.syncVersion ?? ligne.baseSyncVersion ?? 1
        );
        await this.stockage.retirerFileAttente(ligne.id);
      } else if (resultat.statut === "CONFLICT") {
        await this.stockage.ajouterConflit({
          entiteType: ligne.entiteType,
          localId: ligne.localId,
          remoteId: ligne.remoteId,
          monChangement: ligne.payload,
          donneesServeur: resultat.donneesServeur,
        });
        await this.stockage.retirerFileAttente(ligne.id);
      } else {
        // ERROR métier (pas une panne réseau) : reste en file, retenté au
        // prochain cycle normal — pas de backoff dédié, voir commentaire en tête de fichier.
        await this.stockage.marquerEchecFileAttente(ligne.id, resultat.message ?? "Erreur inconnue.");
      }
    }
  }

  private async tirer(): Promise<void> {
    if (this.entitesPull.length === 0) return;
    const horodatageAvant = new Date().toISOString();

    // Horodatage minimum partagé entre toutes les entités demandées pour un
    // seul appel groupé — une entité en avance sera juste re-filtrée par des
    // upserts idempotents, jamais en retard.
    const dernieres = await Promise.all(this.entitesPull.map((e) => this.stockage.lireDernierePull(e)));
    const depuis = dernieres.filter((d): d is string => !!d).sort()[0] ?? new Date(0).toISOString();

    const reponse = await this.client.syncPull(depuis, this.entitesPull);

    for (const entite of this.entitesPull) {
      const lignes = (reponse[entite] ?? []) as { id: string }[];
      const idsEnAttente = estPoussable(entite) ? await this.stockage.idsEnAttente(entite) : new Set<string>();
      const lignesFiltrees = lignes.filter((ligne) => !idsEnAttente.has(ligne.id));
      if (lignesFiltrees.length > 0) {
        await this.stockage.appliquerLignesServeur(entite, lignesFiltrees);
      }
      await this.stockage.ecrireDernierePull(entite, horodatageAvant);
    }
  }

  private async rafraichirCompteurs(): Promise<void> {
    const [file, conflits] = await Promise.all([this.stockage.listerFileAttente(), this.stockage.listerConflits()]);
    this.etat = { ...this.etat, enAttente: file.length, conflits: conflits.length };
    this.emettre();
  }

  private emettre(): void {
    for (const ecouteur of this.ecouteurs) ecouteur(this.etat);
  }
}
