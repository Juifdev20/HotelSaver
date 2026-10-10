/**
 * Cycle de vie de la session d'un poste : démarrage (avec ou sans réseau), connexion, renouvellement du jeton, déconnexion.
 * Aucune dépendance à l'interface ni à Electron : tout ce qui touche le monde extérieur est injecté (voir DepsSession), donc ce
 * fichier se teste entièrement.
 */
import { ErreurApi } from "@hotel-chicago/api-client";
import type { ProfilConnecte } from "@hotel-chicago/types";
import {
  avancerHorloge,
  cleCompte,
  creerVerificateur,
  evaluerAcces,
  memoriserContact,
  verifierMotDePasse,
  type CompteLocal,
  type DecisionAcces,
} from "./session-locale";

export interface JetonSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch secondes. */
  expiresAt: number;
}

export interface ComptesMemorises {
  comptes: Record<string, CompteLocal>;
  /** Clé (e-mail) du compte connecté au dernier lancement ; null après une déconnexion. */
  compteActif: string | null;
}

export interface DepsSession {
  authentifier(email: string, motDePasse: string): Promise<JetonSession>;
  rafraichir(refreshToken: string): Promise<JetonSession>;
  /** GET /auth/me avec ce jeton. */
  chargerProfil(accessToken: string): Promise<ProfilConnecte>;
  lire(): Promise<ComptesMemorises>;
  ecrire(donnees: ComptesMemorises): Promise<void>;
  maintenant(): Date;
}

export type ModeSession = "en-ligne" | "hors-ligne";

export type ResultatSession =
  | { etat: "connecte"; mode: ModeSession; profil: ProfilConnecte; email: string; acces: DecisionAcces & { autorise: true } }
  | { etat: "connexion-requise"; message?: string; email?: string };

export type ResultatConnexion = Extract<ResultatSession, { etat: "connecte" }> | { etat: "erreur"; message: string };

const MARGE_RENOUVELLEMENT_S = 10 * 60;
const MAX_ECHECS_HORS_LIGNE = 5;
const BLOCAGE_HORS_LIGNE_MS = 30_000;

export const estErreurReseau = (e: unknown): boolean => e instanceof ErreurApi && e.statusCode === 0;

export class GestionnaireSession {
  private jeton: JetonSession | null = null;
  private emailActif: string | null = null;
  private mode: ModeSession = "en-ligne";
  /** Mot de passe saisi pour une ouverture HORS LIGNE : gardé en mémoire vive seulement, pour se reconnecter au serveur au retour
   * du réseau sans le redemander. Jamais écrit nulle part. */
  private motDePasseEnMemoire: string | null = null;
  private echecsHorsLigne = 0;
  private bloqueJusqua = 0;

  constructor(private readonly deps: DepsSession) {}

  accessToken(): string | null {
    return this.jeton?.accessToken ?? null;
  }

  modeActuel(): ModeSession {
    return this.mode;
  }

  email(): string | null {
    return this.emailActif;
  }

  // ------------------------------------------------------------------------------------------------ démarrage

  async demarrer(): Promise<ResultatSession> {
    const memo = await this.deps.lire();
    const cle = memo.compteActif;
    const compte = cle ? memo.comptes[cle] : undefined;
    if (!cle || !compte) return { etat: "connexion-requise" };

    if (!compte.refreshToken) {
      // Compte ouvert hors ligne puis fermé sans retour du réseau : pas de jeton à renouveler, on reprend hors ligne si permis.
      return this.ouvrirHorsLigne(compte, cle);
    }
    try {
      const jeton = await this.deps.rafraichir(compte.refreshToken);
      return await this.finaliserConnexionEnLigne(jeton, compte.email, compte.verificateur, memo);
    } catch (e) {
      if (estErreurReseau(e)) return this.ouvrirHorsLigne(compte, cle);
      // Session refusée par le serveur (jeton révoqué/expiré, compte désactivé, licence suspendue) : reconnexion, données conservées.
      return { etat: "connexion-requise", email: compte.email, message: e instanceof Error ? e.message : undefined };
    }
  }

  private async ouvrirHorsLigne(compte: CompteLocal, cle: string): Promise<ResultatSession> {
    const maintenant = this.deps.maintenant();
    const decision = evaluerAcces(compte, maintenant);
    if (!decision.autorise) return { etat: "connexion-requise", email: compte.email, message: decision.message };
    this.emailActif = cle;
    this.mode = "hors-ligne";
    this.jeton = null;
    await this.persisterHorloge(cle);
    return { etat: "connecte", mode: "hors-ligne", profil: compte.profil, email: compte.email, acces: decision };
  }

  // ------------------------------------------------------------------------------------------------ connexion

  async connecter(email: string, motDePasse: string): Promise<ResultatConnexion> {
    const cle = cleCompte(email);
    try {
      const jeton = await this.deps.authentifier(email.trim(), motDePasse);
      const memo = await this.deps.lire();
      const verificateur = await creerVerificateur(cle, motDePasse);
      return await this.finaliserConnexionEnLigne(jeton, cle, verificateur, memo);
    } catch (e) {
      if (!estErreurReseau(e)) return { etat: "erreur", message: e instanceof Error ? e.message : "Erreur de connexion." };
      return this.connecterHorsLigne(cle, motDePasse);
    }
  }

  private async connecterHorsLigne(cle: string, motDePasse: string): Promise<ResultatConnexion> {
    const maintenant = this.deps.maintenant().getTime();
    if (maintenant < this.bloqueJusqua) {
      return { etat: "erreur", message: "Trop de tentatives. Patientez quelques secondes avant de réessayer." };
    }
    const memo = await this.deps.lire();
    const compte = memo.comptes[cle];
    if (!compte) {
      return { etat: "erreur", message: "Impossible de joindre le serveur. Première connexion sur cet appareil : une connexion Internet est nécessaire." };
    }
    if (!(await verifierMotDePasse(cle, motDePasse, compte.verificateur))) {
      this.echecsHorsLigne += 1;
      if (this.echecsHorsLigne >= MAX_ECHECS_HORS_LIGNE) {
        this.echecsHorsLigne = 0;
        this.bloqueJusqua = maintenant + BLOCAGE_HORS_LIGNE_MS;
      }
      return { etat: "erreur", message: "Email ou mot de passe incorrect." };
    }
    this.echecsHorsLigne = 0;
    const decision = evaluerAcces(compte, this.deps.maintenant());
    if (!decision.autorise) return { etat: "erreur", message: decision.message };

    this.emailActif = cle;
    this.mode = "hors-ligne";
    this.jeton = null;
    this.motDePasseEnMemoire = motDePasse;
    await this.deps.ecrire({ comptes: memo.comptes, compteActif: cle });
    await this.persisterHorloge(cle);
    return { etat: "connecte", mode: "hors-ligne", profil: compte.profil, email: compte.email, acces: decision };
  }

  private async finaliserConnexionEnLigne(
    jeton: JetonSession,
    cle: string,
    verificateur: CompteLocal["verificateur"],
    memo: ComptesMemorises
  ): Promise<Extract<ResultatSession, { etat: "connecte" }>> {
    const profil = await this.deps.chargerProfil(jeton.accessToken);
    const compte = memoriserContact({ ...(memo.comptes[cle] ?? {}), email: cle, verificateur }, profil, jeton.refreshToken, this.deps.maintenant());
    await this.deps.ecrire({ comptes: { ...memo.comptes, [cle]: compte }, compteActif: cle });
    this.jeton = jeton;
    this.emailActif = cle;
    this.mode = "en-ligne";
    this.motDePasseEnMemoire = null;
    return { etat: "connecte", mode: "en-ligne", profil, email: cle, acces: { autorise: true, joursRestants: Number.POSITIVE_INFINITY, enGrace: false } };
  }

  // ------------------------------------------------------------------------------------------------ entretien

  /**
   * À appeler régulièrement : renouvelle le jeton avant son expiration, et, après une ouverture hors ligne, retrouve l'accès au
   * serveur dès que le réseau revient. Renvoie `profil` quand on vient de repasser en ligne ou que le profil a été relu.
   */
  async entretenir(): Promise<{ profil?: ProfilConnecte; mode: ModeSession }> {
    const cle = this.emailActif;
    if (!cle) return { mode: this.mode };
    const maintenantS = this.deps.maintenant().getTime() / 1000;
    const aRenouveler = !this.jeton || this.jeton.expiresAt - maintenantS < MARGE_RENOUVELLEMENT_S;
    if (!aRenouveler) return { mode: this.mode };

    const memo = await this.deps.lire();
    const compte = memo.comptes[cle];
    if (!compte) return { mode: this.mode };
    try {
      let jeton: JetonSession;
      if (this.jeton?.refreshToken ?? compte.refreshToken) jeton = await this.deps.rafraichir((this.jeton?.refreshToken ?? compte.refreshToken)!);
      else if (this.motDePasseEnMemoire) jeton = await this.deps.authentifier(compte.email, this.motDePasseEnMemoire);
      else return { mode: this.mode };
      this.jeton = jeton;
      const profil = await this.deps.chargerProfil(jeton.accessToken);
      const maj = memoriserContact(compte, profil, jeton.refreshToken, this.deps.maintenant());
      await this.deps.ecrire({ comptes: { ...memo.comptes, [cle]: maj }, compteActif: cle });
      this.mode = "en-ligne";
      this.motDePasseEnMemoire = null;
      return { mode: "en-ligne", profil };
    } catch {
      // Réseau coupé (ou serveur occupé) : on réessaiera ; le jeton actuel reste utilisable jusqu'à son expiration.
      return { mode: this.mode };
    }
  }

  /** Une synchronisation vient de réussir : le serveur a été joint, la durée de grâce repart de maintenant (heure du serveur si connue). */
  async confirmerContact(decalageHorlogeMs = 0): Promise<void> {
    const cle = this.emailActif;
    if (!cle) return;
    const memo = await this.deps.lire();
    const compte = memo.comptes[cle];
    if (!compte) return;
    const serveurLe = new Date(this.deps.maintenant().getTime() + decalageHorlogeMs);
    await this.deps.ecrire({ comptes: { ...memo.comptes, [cle]: memoriserContact(compte, compte.profil, null, serveurLe) }, compteActif: cle });
  }

  /** Mémorise un profil relu auprès du serveur (réglages changés par le patron). */
  async memoriserProfil(profil: ProfilConnecte): Promise<void> {
    const cle = this.emailActif;
    if (!cle) return;
    const memo = await this.deps.lire();
    const compte = memo.comptes[cle];
    if (compte) await this.deps.ecrire({ comptes: { ...memo.comptes, [cle]: { ...compte, profil } }, compteActif: cle });
  }

  /** Fait avancer l'horloge de référence hors ligne (jamais en arrière). Renvoie la décision d'accès à jour. */
  async persisterHorloge(cle = this.emailActif): Promise<DecisionAcces | null> {
    if (!cle) return null;
    const memo = await this.deps.lire();
    const compte = memo.comptes[cle];
    if (!compte) return null;
    const maintenant = this.deps.maintenant();
    const maj = avancerHorloge(compte, maintenant);
    if (maj !== compte) await this.deps.ecrire({ comptes: { ...memo.comptes, [cle]: maj }, compteActif: memo.compteActif });
    return evaluerAcces(maj, maintenant);
  }

  // ------------------------------------------------------------------------------------------------ déconnexion

  /** Ferme la session. Les données de l'hôtel restent sur le poste (elles servent au travail hors ligne) ; le jeton de renouvellement,
   * lui, est effacé : sans mot de passe ou nouvelle connexion, plus d'accès au serveur. */
  async deconnecter(): Promise<void> {
    const memo = await this.deps.lire();
    const comptes = { ...memo.comptes };
    if (this.emailActif && comptes[this.emailActif]) comptes[this.emailActif] = { ...comptes[this.emailActif], refreshToken: null };
    await this.deps.ecrire({ comptes, compteActif: null });
    this.jeton = null;
    this.emailActif = null;
    this.motDePasseEnMemoire = null;
    this.mode = "en-ligne";
  }
}
