/**
 * Déroulement d'un paiement en ligne vu de l'écran (abonnement du patron OU acompte d'un client sur le site), SANS aucune dépendance à
 * l'interface : bureau (React), mobile (React Native) et site web l'affichent avec exactement la même logique — envoi, attente de la
 * confirmation (sur le téléphone, ou sur la page de la banque pour une carte), réussite, échec.
 * (La version « abonnement » de miroir-local, `SuiviPaiementAbonnement`, a la même logique avec le champ `etatAbonnement` ; à fusionner un jour.)
 *
 *   saisie → envoi → attente → reussi | echec
 *
 * Règles qui comptent :
 *  - une même tentative garde sa clé d'idempotence : si le réseau coupe pendant l'envoi, « Réessayer » ne débite jamais deux fois ;
 *  - pendant l'attente une panne réseau n'est PAS un échec (le paiement continue côté serveur) : on continue d'interroger ;
 *  - le serveur crédite l'hôtel tout seul dès que ScanLinkPay confirme, même si l'écran est fermé : après quelques minutes on le dit.
 */
import { ErreurApi } from "./client";

export type PhasePaiement = "saisie" | "envoi" | "attente" | "reussi" | "echec";

/** Le minimum qu'un paiement doit exposer pour être suivi (abonnement ou acompte). */
export interface PaiementSuivi {
  id: string;
  statut: "EN_ATTENTE" | "REUSSI" | "ECHEC" | "EXPIRE";
  messageErreur: string | null;
  createdAt: string;
}

/** D'où viennent l'envoi et la lecture : l'API du patron (abonnement) ou l'API publique du site (acompte). */
export interface SourcePaiement<TPaiement extends PaiementSuivi, TDemande, TComplement> {
  lancer(demande: TDemande, cleIdempotence: string): Promise<TPaiement>;
  lire(id: string): Promise<{ paiement: TPaiement; complement?: TComplement }>;
}

export interface EtatSuivi<TPaiement extends PaiementSuivi, TComplement = unknown> {
  phase: PhasePaiement;
  paiement: TPaiement | null;
  /** Ce que la lecture renvoie en plus du paiement (ex. l'état d'abonnement à jour) une fois le paiement réussi. */
  complement: TComplement | null;
  /** Message d'erreur à afficher en phase « echec » (ou en « saisie » après un envoi refusé). */
  message: string | null;
  /** Secondes écoulées depuis l'envoi de la demande. */
  secondes: number;
  /** Au-delà de ~1 minute sans confirmation : afficher les conseils (solde, réseau, code PIN). */
  lent: boolean;
  /** Au-delà de ~5 minutes : le serveur autorise un nouvel essai, et on peut fermer l'écran sans rien perdre. */
  peutReessayer: boolean;
}

export interface OptionsSuivi {
  intervalleMs?: number;
  delaiLentMs?: number;
  delaiNouvelEssaiMs?: number;
  genererCle?: () => string;
  maintenant?: () => number;
}

function cleAleatoire(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class SuiviPaiement<TPaiement extends PaiementSuivi, TDemande, TComplement = unknown> {
  private etatCourant: EtatSuivi<TPaiement, TComplement> = { phase: "saisie", paiement: null, complement: null, message: null, secondes: 0, lent: false, peutReessayer: false };
  private readonly ecouteurs = new Set<(e: EtatSuivi<TPaiement, TComplement>) => void>();
  private minuteur: ReturnType<typeof setTimeout> | null = null;
  private debut = 0;
  private arrete = false;
  private cleEnCours: string | null = null;
  private interrogationEnCours = false;
  private readonly intervalle: number;
  private readonly delaiLent: number;
  private readonly delaiNouvelEssai: number;
  private readonly genererCle: () => string;
  private readonly maintenant: () => number;

  constructor(private readonly source: SourcePaiement<TPaiement, TDemande, TComplement>, options: OptionsSuivi = {}) {
    this.intervalle = options.intervalleMs ?? 4000;
    this.delaiLent = options.delaiLentMs ?? 60_000;
    this.delaiNouvelEssai = options.delaiNouvelEssaiMs ?? 5 * 60_000;
    this.genererCle = options.genererCle ?? cleAleatoire;
    this.maintenant = options.maintenant ?? Date.now;
  }

  etat(): EtatSuivi<TPaiement, TComplement> {
    return this.etatCourant;
  }

  onChangement(ecouteur: (e: EtatSuivi<TPaiement, TComplement>) => void): () => void {
    this.ecouteurs.add(ecouteur);
    ecouteur(this.etatCourant);
    return () => this.ecouteurs.delete(ecouteur);
  }

  private maj(partiel: Partial<EtatSuivi<TPaiement, TComplement>>): void {
    this.etatCourant = { ...this.etatCourant, ...partiel };
    for (const e of this.ecouteurs) e(this.etatCourant);
  }

  /** Lance le paiement : le serveur calcule le montant, ScanLinkPay envoie la demande de confirmation au téléphone. */
  async payer(demande: TDemande): Promise<void> {
    if (this.etatCourant.phase === "envoi" || this.etatCourant.phase === "attente") return;
    this.arrete = false;
    this.cleEnCours ??= this.genererCle();
    this.debut = this.maintenant();
    this.maj({ phase: "envoi", message: null, paiement: null, complement: null, secondes: 0, lent: false, peutReessayer: false });
    try {
      const paiement = await this.source.lancer(demande, this.cleEnCours);
      this.cleEnCours = null;
      this.suivre(paiement);
    } catch (e) {
      const incertain = e instanceof ErreurApi && (e.statusCode === 0 || e.statusCode >= 500);
      if (!incertain) this.cleEnCours = null; // refus net (numéro, formule, déjà un paiement en cours…) : la prochaine tentative est une nouvelle demande
      this.maj({ phase: "saisie", message: e instanceof Error ? e.message : "Le paiement n'a pas pu être lancé." });
    }
  }

  /** Reprend l'attente d'un paiement déjà envoyé (écran rouvert pendant qu'une demande attend sur le téléphone). */
  reprendre(paiement: TPaiement): void {
    this.arrete = false;
    this.debut = Math.min(this.maintenant(), Date.parse(paiement.createdAt) || this.maintenant());
    this.suivre(paiement);
  }

  /** Revient à la saisie (après un échec, ou pour changer de formule). */
  reinitialiser(): void {
    this.arreterInterrogation();
    this.cleEnCours = null;
    this.maj({ phase: "saisie", paiement: null, complement: null, message: null, secondes: 0, lent: false, peutReessayer: false });
  }

  /** À appeler quand l'écran se ferme. */
  arreter(): void {
    this.arrete = true;
    this.arreterInterrogation();
  }

  private arreterInterrogation(): void {
    if (this.minuteur) clearTimeout(this.minuteur);
    this.minuteur = null;
  }

  private suivre(paiement: TPaiement): void {
    this.traiter(paiement, null);
    if (this.etatCourant.phase === "attente") this.programmer(paiement.id);
  }

  /** Applique la réponse du serveur à l'état. */
  private traiter(paiement: TPaiement, complement: TComplement | null): void {
    const secondes = Math.max(0, Math.round((this.maintenant() - this.debut) / 1000));
    const lent = secondes * 1000 >= this.delaiLent;
    const peutReessayer = secondes * 1000 >= this.delaiNouvelEssai;
    if (paiement.statut === "REUSSI") this.maj({ phase: "reussi", paiement, complement, message: null, secondes, lent: false, peutReessayer: false });
    else if (paiement.statut === "ECHEC" || paiement.statut === "EXPIRE") {
      this.maj({ phase: "echec", paiement, message: paiement.messageErreur ?? "Le paiement n'a pas abouti.", secondes, lent: false, peutReessayer: true });
    } else this.maj({ phase: "attente", paiement, secondes, lent, peutReessayer });
  }

  private programmer(id: string): void {
    this.arreterInterrogation();
    if (this.arrete) return;
    this.minuteur = setTimeout(() => void this.interroger(id), this.intervalle);
  }

  private async interroger(id: string): Promise<void> {
    if (this.arrete || this.interrogationEnCours) return;
    this.interrogationEnCours = true;
    try {
      const { paiement, complement } = await this.source.lire(id);
      if (this.arrete) return;
      this.traiter(paiement, complement ?? null);
    } catch (e) {
      // Panne passagère ou serveur occupé : le paiement, lui, continue ; on réessaie. Seule exception : l'accès au paiement refusé pour de bon.
      if (e instanceof ErreurApi && (e.statusCode === 404 || e.statusCode === 403)) {
        this.maj({ phase: "echec", message: "Ce paiement est introuvable.", peutReessayer: true });
        return;
      }
      const secondes = Math.round((this.maintenant() - this.debut) / 1000);
      this.maj({ secondes, lent: secondes * 1000 >= this.delaiLent, peutReessayer: secondes * 1000 >= this.delaiNouvelEssai });
    } finally {
      this.interrogationEnCours = false;
    }
    if (!this.arrete && this.etatCourant.phase === "attente") this.programmer(id);
  }
}
