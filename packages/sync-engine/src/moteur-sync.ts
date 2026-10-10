import { ENTITES_PUSH, type ClientApi, type EntitePull, type EntitePush } from "@hotel-chicago/api-client";
import type { ConflitSync, EtatSync, LigneFileAttente, StockageLocal } from "./types";

/** Section 10.2 : backoff exponentiel sur échec réseau (pas sur un simple
 * ERROR métier renvoyé dans un lot par ailleurs réussi — voir pousser()).
 * Réinitialisé dès qu'un ping de connexion ou un cycle réussit. */
const PALIERS_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 120_000];

/** Section 10.2 : détection de connectivité par ping périodique, pas
 * seulement l'état réseau du système. */
const INTERVALLE_PING_MS = 20_000;

/** Rejets métier (statut ERROR renvoyé par le serveur — erreur
 * déterministe, pas une panne réseau qui elle fait échouer le cycle entier)
 * après lesquels une opération n'est plus re-poussée. Elle reste en file et
 * visible dans « Actions échouées » pour une décision humaine (retirer) —
 * sans ce seuil, une opération invalide était réémise à chaque poll : une
 * ligne de commande refusée par le serveur a été re-tentée 52 fois en
 * conditions réelles, un aller-retour réseau à chaque fois (27/09/2026). */
export const SEUIL_ECHEC_DEFINITIF = 3;

/** Le serveur refuse plus de 200 opérations par envoi ; après des jours hors ligne la file peut en contenir davantage. */
const TAILLE_LOT_PUSH = 200;
/** Lignes demandées par type et par page de pull (le serveur plafonne à 5000). */
const LIMITE_PAGE_PULL = 1000;
const LIMITE_PAGE_PULL_MAX = 5000;
/** Garde-fou contre une boucle de pagination sans fin. */
const PAGES_PULL_MAX = 200;
/** Écart d'horloge au-delà duquel on prévient l'utilisateur. */
const SEUIL_HORLOGE_SUSPECTE_MS = 5 * 60_000;
const DELAI_RETENTE_PASSAGERE_MS = 5_000;

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
    derniereSyncReussieLe: null,
    echecsDefinitifs: 0,
    decalageHorlogeMs: null,
    horlogeSuspecte: false,
  };
  private minuteur: ReturnType<typeof setInterval> | null = null;
  private cycleEnCours: Promise<void> | null = null;
  private palierBackoff = -1;
  /** Une écriture est arrivée pendant un cycle en cours : ce cycle avait déjà
   * lu la file, donc il ne l'enverra pas — on enchaîne un cycle juste après
   * au lieu d'attendre le prochain poll (jusqu'à 20 s, constaté à la caisse
   * cafétaria le 08/10/2026 : boutons « Encaisser » / « Ajouter » grisés). */
  private envoiDemande = false;
  /** Dernier contact réussi avec le serveur : pas de ping /health
   * supplémentaire avant chaque envoi si on vient de lui parler. */
  private dernierContactOk = 0;
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
    if (this.cycleEnCours) this.envoiDemande = true;
    void this.cycle();
  }

  /** Pull-to-refresh manuel : pousse la file puis tire les changements. */
  async forcerSynchronisation(): Promise<void> {
    await this.cycle();
  }

  async listerConflits(): Promise<ConflitSync[]> {
    return this.stockage.listerConflits();
  }

  /** Expose la file d'attente pour l'affichage des actions échouées de façon
   * permanente (ex. stock insuffisant côté serveur) — voir `annulerOperation`. */
  async listerFileAttente(): Promise<LigneFileAttente[]> {
    return this.stockage.listerFileAttente();
  }

  /** Retire une entrée de la file sans jamais la retenter — pour une erreur
   * métier permanente (ex. "Transaction not found", stock insuffisant) que le
   * réseau ne résoudra jamais tout seul. Retourne l'entrée retirée pour que
   * l'appelant sache quelle écriture optimiste locale annuler (elle
   * n'existera jamais côté serveur). */
  async annulerOperation(id: string): Promise<LigneFileAttente | null> {
    const file = await this.stockage.listerFileAttente();
    const ligne = file.find((l) => l.id === id) ?? null;
    if (ligne) {
      await this.stockage.retirerFileAttente(id);
      await this.rafraichirCompteurs();
    }
    return ligne;
  }

  /** Ids déjà connus comme en attente d'envoi pour un type d'entité — pour
   * qu'un écran désactive une action qui dépend d'une création pas encore
   * confirmée (ex. ajouter une ligne à un sous-compte pas encore synchronisé). */
  async idsEnAttente(entiteType: EntitePush): Promise<Set<string>> {
    return this.stockage.idsEnAttente(entiteType);
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
      // Écriture arrivée pendant ce cycle : on l'envoie tout de suite.
      if (this.envoiDemande) {
        this.envoiDemande = false;
        void this.cycle();
      }
    });
    return this.cycleEnCours;
  }

  private async executerCycle(): Promise<void> {
    if (Date.now() < this.prochainEssaiAu) return;

    // Serveur joint il y a moins de 15 s : pas de ping avant d'envoyer
    // (un aller-retour de moins pour chaque vente) ; un échec réseau de
    // l'envoi passe de toute façon par le backoff ci-dessous.
    const recent = this.etat.enLigne && Date.now() - this.dernierContactOk < 15_000;
    const enLigne = recent || (await this.client.estJoignable());
    if (!enLigne) {
      this.etat = { ...this.etat, enLigne: false };
      this.emettre();
      return;
    }
    this.palierBackoff = -1;

    try {
      const envoyees = await this.pousser();
      this.dernierContactOk = Date.now();
      if (envoyees > 0) {
        // Les écrans rechargent leur miroir sur `dernierePousseeLe` : on les
        // prévient dès que l'envoi est confirmé (ids serveur connus, boutons
        // réactivables) sans attendre la réception des autres données.
        this.etat = { ...this.etat, enLigne: true, dernierePousseeLe: new Date().toISOString() };
        await this.rafraichirCompteurs();
      }
      await this.tirer();
      this.dernierContactOk = Date.now();
      const maintenant = new Date().toISOString();
      this.etat = {
        ...this.etat,
        enLigne: true,
        derniereErreur: null,
        dernierePousseeLe: maintenant,
        derniereSyncReussieLe: maintenant,
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

  /** Renvoie le nombre d'opérations envoyées (0 = rien à faire). */
  private async pousser(): Promise<number> {
    // Les opérations rejetées définitivement par le serveur ne sont plus
    // envoyées : elles restent en file pour l'écran « Actions échouées ».
    const file = (await this.stockage.listerFileAttente()).filter((l) => l.attempts < SEUIL_ECHEC_DEFINITIF);
    if (file.length === 0) return 0;

    // Par lots, dans l'ordre : le serveur refuse plus de 200 opérations d'un coup. Un lot qui échoue côté réseau
    // interrompt le cycle (backoff) ; les lots déjà confirmés ont été retirés de la file, rien n'est renvoyé en double.
    for (let debut = 0; debut < file.length; debut += TAILLE_LOT_PUSH) {
      await this.pousserLot(file.slice(debut, debut + TAILLE_LOT_PUSH));
    }
    return file.length;
  }

  private async pousserLot(file: LigneFileAttente[]): Promise<void> {
    const decalage = this.etat.decalageHorlogeMs ?? 0;
    const reponse = await this.client.syncPush(
      file.map((ligne) => ({
        entiteType: ligne.entiteType,
        localId: ligne.localId,
        remoteId: ligne.remoteId,
        operation: ligne.operation,
        payload: ligne.payload,
        baseSyncVersion: ligne.baseSyncVersion,
        // Heure de l'action, ramenée à l'heure du serveur si l'horloge de l'appareil était décalée.
        horodatageClient: new Date(Date.parse(ligne.createdAt) + decalage).toISOString(),
      }))
    );
    this.noterHorloge(reponse.serveurLe);
    const resultats = reponse.resultats;
    let panneePassagere = false;

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
        // Un CREATE parent peut avoir créé des enfants côté serveur (ex. le
        // premier sous-compte d'un CompteCafeteria) : le mapping
        // localId→remoteId est répercuté tout de suite — sinon l'enfant
        // local resterait un fantôme non synchronisable et le prochain pull
        // le créerait en doublon sous son vrai id serveur (bug du 27/09/2026).
        for (const enfant of resultat.enfants ?? []) {
          await this.stockage.confirmerPush(enfant.entiteType, enfant.localId, enfant.remoteId, enfant.syncVersion ?? 1);
        }
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
      } else if (resultat.temporaire) {
        // Panne passagère du serveur (ou opération déjà en cours de traitement) : ce n'est PAS un échec de l'action.
        // Elle reste en file sans compter un essai, et repart au prochain cycle.
        panneePassagere = true;
      } else {
        // ERROR métier (pas une panne réseau) : reste en file, retenté au
        // prochain cycle normal — pas de backoff dédié, voir commentaire en tête de fichier.
        await this.stockage.marquerEchecFileAttente(ligne.id, resultat.message ?? "Erreur inconnue.");
      }
    }
    if (panneePassagere) this.prochainEssaiAu = Math.max(this.prochainEssaiAu, Date.now() + DELAI_RETENTE_PASSAGERE_MS);
  }

  /** Mesure l'écart entre l'horloge de l'appareil et celle du serveur (aller-retour négligé : l'ordre de grandeur suffit). */
  private noterHorloge(serveurLe: string | undefined): void {
    if (!serveurLe) return;
    const serveur = Date.parse(serveurLe);
    if (Number.isNaN(serveur)) return;
    const decalage = serveur - Date.now();
    this.etat = { ...this.etat, decalageHorlogeMs: decalage, horlogeSuspecte: Math.abs(decalage) > SEUIL_HORLOGE_SUSPECTE_MS };
  }

  /**
   * Reçoit les changements du serveur, page par page.
   *
   * - Le point de départ suivant vient de l'HEURE DU SERVEUR (`_meta.curseur`), jamais de l'horloge de l'appareil : une
   *   tablette en avance de deux heures ne manque plus les changements des deux dernières heures.
   * - Chaque type a son curseur. Un type jamais tiré (`null`) démarre à l'epoch, sans hériter du curseur d'un voisin
   *   (bug du 26/09/2026 : « aucun produit » après l'ajout de la Cafétaria).
   * - Page pleine (`_meta.tronque`) : on reprend au dernier `updatedAt` reçu et on re-demande, tant qu'il en reste. Le
   *   curseur est enregistré à chaque page : une coupure en plein rattrapage reprend là où elle s'était arrêtée.
   * - Les suppressions reçues (`_meta.suppressions`) sont retirées du miroir local.
   */
  private async tirer(): Promise<void> {
    if (this.entitesPull.length === 0) return;
    const EPOCH = new Date(0).toISOString();
    const horodatageAvant = new Date().toISOString();

    const curseurs = new Map<EntitePull, string>();
    for (const entite of this.entitesPull) curseurs.set(entite, (await this.stockage.lireDernierePull(entite)) ?? EPOCH);
    const limites = new Map<EntitePull, number>(this.entitesPull.map((e) => [e, LIMITE_PAGE_PULL]));

    let restants: EntitePull[] = [...this.entitesPull];
    for (let page = 0; page < PAGES_PULL_MAX && restants.length > 0; page++) {
      // Les types qui partagent le même curseur et la même limite sont demandés ensemble (cas courant : un seul appel).
      const groupes = new Map<string, EntitePull[]>();
      for (const entite of restants) {
        const cle = `${curseurs.get(entite)}|${limites.get(entite)}`;
        groupes.set(cle, [...(groupes.get(cle) ?? []), entite]);
      }
      const suivants: EntitePull[] = [];

      for (const entites of groupes.values()) {
        const depuis = curseurs.get(entites[0])!;
        const limite = limites.get(entites[0])!;
        const reponse = await this.client.syncPull(depuis, entites, limite);
        this.noterHorloge(reponse._meta?.serveurLe);
        const tronque = new Set<EntitePull>(reponse._meta?.tronque ?? []);

        for (const entite of entites) {
          const lignes = (reponse[entite] ?? []) as { id: string; updatedAt?: string }[];
          const idsEnAttente = estPoussable(entite) ? await this.stockage.idsEnAttente(entite) : new Set<string>();
          const lignesFiltrees = lignes.filter((ligne) => !idsEnAttente.has(ligne.id));
          if (lignesFiltrees.length > 0) await this.stockage.appliquerLignesServeur(entite, lignesFiltrees);

          if (!tronque.has(entite) || lignes.length === 0) {
            await this.stockage.ecrireDernierePull(entite, reponse._meta?.curseur ?? horodatageAvant);
            continue;
          }
          const dernier = lignes[lignes.length - 1].updatedAt;
          const ancien = curseurs.get(entite)!;
          if (dernier && dernier > ancien) {
            curseurs.set(entite, dernier);
            await this.stockage.ecrireDernierePull(entite, dernier);
          } else if ((limites.get(entite) ?? 0) < LIMITE_PAGE_PULL_MAX) {
            // Toute la page porte le même instant que le curseur : on agrandit la page pour la dépasser.
            limites.set(entite, Math.min((limites.get(entite) ?? LIMITE_PAGE_PULL) * 2, LIMITE_PAGE_PULL_MAX));
          } else {
            // Plus de 5000 lignes au même instant : on passe à la milliseconde suivante plutôt que de boucler.
            const suite = new Date(Date.parse(ancien) + 1).toISOString();
            curseurs.set(entite, suite);
            await this.stockage.ecrireDernierePull(entite, suite);
          }
          suivants.push(entite);
        }

        const parType = new Map<EntitePull, string[]>();
        for (const s of reponse._meta?.suppressions ?? []) parType.set(s.entiteType, [...(parType.get(s.entiteType) ?? []), s.id]);
        for (const [entite, ids] of parType) await this.stockage.supprimerLignesServeur(entite, ids);
      }
      restants = suivants;
    }
  }

  private async rafraichirCompteurs(): Promise<void> {
    const [file, conflits] = await Promise.all([this.stockage.listerFileAttente(), this.stockage.listerConflits()]);
    this.etat = {
      ...this.etat,
      enAttente: file.length,
      conflits: conflits.length,
      echecsDefinitifs: file.filter((l) => l.attempts >= SEUIL_ECHEC_DEFINITIF).length,
    };
    this.emettre();
  }

  private emettre(): void {
    for (const ecouteur of this.ecouteurs) ecouteur(this.etat);
  }
}
