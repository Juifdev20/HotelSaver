import {
  Chambre,
  Client,
  CompteCafeteria,
  Devise,
  Facture,
  InventairePhysique,
  LigneCommande,
  LignePreparationInventaire,
  MenuDuJour,
  ModePaiement,
  MouvementStock,
  ListeNotifications,
  ProduitPopulaire,
  Occupation,
  Produit,
  ProfilConnecte,
  RapportMensuel,
  DepartementRapport,
  CreerDepense,
  Depense,
  FiltresDepenses,
  ModifierDepense,
  RecetteDuJour,
  RecetteDuMois,
  Reservation,
  Role,
  SiteHotelEditable,
  SousCompte,
  StatutChambre,
  StatutCompte,
  StatutLigne,
  StatutReservation,
  UsageImage,
  UtilisateurAuthentifie,
  VenteCafeteria,
  VentesRecentes,
} from "@hotel-chicago/types";

/** Signal d'annulation après `ms` millisecondes. `AbortSignal.timeout` n'existe pas partout (anciens moteurs mobiles). */
function signalAvecDelai(ms: number): AbortSignal | undefined {
  try {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
    if (typeof AbortController !== "undefined") {
      const controleur = new AbortController();
      setTimeout(() => controleur.abort(), ms);
      return controleur.signal;
    }
  } catch {
    // pas de délai plutôt qu'un échec de la requête
  }
  return undefined;
}

export class ErreurApi extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "ErreurApi";
  }
}

export interface FiltresChambres {
  statut?: string;
  type?: string;
}

export interface FiltresProduits {
  categorie?: string;
  actif?: boolean;
}

/** Champs de apps/api/src/produits/dto/create-produit.dto.ts. */
export interface DonneesProduit {
  nom: string;
  categorie: string;
  prix: number;
  devise: Devise;
  /** Plat préparé ou article de comptoir (défaut ARTICLE côté API). */
  typeProduit?: "ARTICLE" | "PLAT";
  photo?: string;
  stockActuel?: number;
  seuilAlerte?: number;
  prixAchat?: number;
  /** Opt-in site public : visible/commandable sur la page « Cuisine ». */
  commandableEnLigne?: boolean;
  /** Description affichée sur la page publique. */
  description?: string;
  /** PLAT : portions préparées (absent = illimité). */
  portionsDisponibles?: number;
  /** ARTICLE : code-barres (fabricant ou EAN-13 interne). */
  codeBarres?: string;
}

/** Champs de apps/api/src/produits/dto/update-produit.dto.ts (stockActuel
 * volontairement absent — seul le module Stock peut changer la quantité). */
export interface DonneesModificationProduit {
  nom?: string;
  categorie?: string;
  prix?: number;
  devise?: Devise;
  typeProduit?: "ARTICLE" | "PLAT";
  /** null retire la photo. */
  photo?: string | null;
  seuilAlerte?: number;
  prixAchat?: number;
  actif?: boolean;
  commandableEnLigne?: boolean;
  description?: string;
  /** PLAT : portions préparées ; null = repasser en illimité. */
  portionsDisponibles?: number | null;
  /** ARTICLE : code-barres ; null = retirer le code. */
  codeBarres?: string | null;
}

/** SORTIE_VENTE exclu : généré automatiquement par une ligne de commande
 * cafétaria, jamais saisi directement (voir stock.service.ts). */
export interface DonneesMouvementStock {
  produitId: string;
  type: "ENTREE" | "PERTE" | "AJUSTEMENT";
  quantite: number;
  motif?: string;
}

export interface DonneesOuvrirCompte {
  tableOuNom: string;
  nomPremierSousCompte?: string;
}

export interface DonneesAjouterLigne {
  sousCompteId: string;
  produitId: string;
  quantite: number;
}

/** UNE_PERSONNE : règle la part d'une seule personne (reçu individuel), le compte reste ouvert pour les
 * autres. GROUPE : règle tout ce qui reste à payer. PAR_SOUS_COMPTE/PARTAGE_EGAL existent côté API
 * mais pas encore ici. */
export type DonneesEncaissement =
  | { mode: "GROUPE"; modePaiement: ModePaiement }
  | { mode: "UNE_PERSONNE"; modePaiement: ModePaiement; sousCompteId: string };

export interface FiltresReservations {
  statut?: StatutReservation;
  chambreId?: string;
  /** Plage planning [du, au) : réservations qui chevauchent la fenêtre. */
  du?: string;
  au?: string;
}

/** Champs de apps/api/src/reservations/dto/create-reservation.dto.ts —
 * `clientId` (client existant) XOR `client` (nouveau, créé inline). */
export interface DonneesReservation {
  chambreId: string;
  clientId?: string;
  client?: { nom: string; telephone?: string; email?: string; typePiece?: string; numeroPiece?: string };
  dateArrivee: string;
  dateDepart: string;
  acompte?: number;
  note?: string;
  /** Walk-in : la réservation naît EN_COURS et la chambre passe OCCUPEE. */
  installerImmediatement?: boolean;
}

/** Champs de apps/api/src/reservations/dto/update-reservation.dto.ts. */
export interface DonneesModificationReservation {
  dateArrivee?: string;
  dateDepart?: string;
  acompte?: number;
  note?: string;
  /** Message visible par le client sur sa page de suivi « Ma réservation ». */
  reponseReception?: string;
}

/** Champs de apps/api/src/clients/dto/modifier-client.dto.ts. */
export interface DonneesModificationClient {
  nom?: string;
  telephone?: string;
  email?: string;
  typePiece?: string;
  numeroPiece?: string;
  notes?: string;
}

/** GET /dashboard/journee-reception — remise de poste (heure de Lubumbashi). */
export interface JourneeReception {
  date: string;
  recette: {
    chambres: { montantUSD: number; montantCDF: number; nombreFactures: number };
    cafeteria: { montantUSD: number; montantCDF: number; nombreVentes: number };
    total: { montantUSD: number; montantCDF: number };
  };
  arrivees: { effectuees: ReservationResume[]; restantes: ReservationResume[] };
  departs: { effectues: ReservationResume[]; restants: ReservationResume[] };
  chambres: Occupation;
  comptesCafeteriaOuverts: number;
}

interface ReservationResume {
  statut: StatutReservation;
  client: { nom: string };
  chambre: { numero: string };
}

/** Corps de POST /reservations/:id/annuler — ligne plate, sans `include`
 * (contrairement à findAll/findOne qui incluent chambre/client/facture). */
export type ReservationAnnulee = Omit<Reservation, "chambre" | "client" | "facture">;

/** GET /clients — le client et tout son historique de séjours. */
export interface ClientAvecSejours extends Client {
  createdAt: string;
  reservations: Reservation[];
}

/** GET/POST /taux-change — une ligne d'historique (1 USD = cdfParUsd CDF). */
export interface TauxChange {
  id: string;
  cdfParUsd: string;
  definiPar: string;
  createdAt: string;
}

/** Champs de apps/api/src/chambres/dto/create-chambre.dto.ts (PATRON). */
export interface DonneesChambre {
  numero: string;
  type: string;
  prixParNuit: number;
  devise: Devise;
  statut?: StatutChambre;
  photos?: string[];
}

/** Champs de update-chambre.dto.ts — tous optionnels, le filtrage par rôle
 * (RECEPTIONNISTE : statut/photos uniquement) est fait côté serveur. */
export type DonneesModificationChambre = Partial<DonneesChambre>;

/** Champs de apps/api/src/factures/dto/create-facture.dto.ts. */
export interface DonneesFacture {
  reservationId: string;
  modePaiement: ModePaiement;
  deviseRegleeParClient?: Devise;
  montantRegleParClient?: number;
  deviseRenduChoisie?: Devise;
}

/** Réponse de POST /reservations/:id/check-in et .../check-out — pas un
 * objet Reservation complet, voir reservations.service.ts. */
export interface ResultatCheckInOut {
  reservationId: string;
  statutReservation: StatutReservation;
  chambre: Chambre;
}

/** Réponse de GET/POST/PATCH /utilisateurs — jamais supabaseAuthId (voir
 * apps/api/src/utilisateurs/utilisateurs.service.ts, SELECTION). */
export interface Utilisateur {
  id: string;
  nom: string;
  email: string | null;
  role: Role;
  actif: boolean;
  createdAt: string;
}

/** Champs de apps/api/src/utilisateurs/dto/create-utilisateur.dto.ts. */
export interface DonneesCreationUtilisateur {
  nom: string;
  email: string;
  motDePasse: string;
  role: Role;
}

/** Champs de apps/api/src/utilisateurs/dto/update-utilisateur.dto.ts —
 * tous optionnels (nom/email/motDePasse/actif), au moins un requis. */
export type DonneesModificationUtilisateur = Partial<Pick<DonneesCreationUtilisateur, "nom" | "email" | "motDePasse">> & {
  actif?: boolean;
};

// ---------------------------------------------------------------------
// Synchronisation hors-ligne (apps/api/src/sync/)
// ---------------------------------------------------------------------

/** Miroir exact de apps/api/src/sync/entites-synchronisables.ts. */
export const ENTITES_PUSH = [
  "Chambre",
  "Reservation",
  "Produit",
  "MouvementStock",
  "CompteCafeteria",
  "SousCompte",
  "LigneCommande",
  "Depense",
  "Facture",
  "VenteCafeteria",
  "Client",
] as const;
export type EntitePush = (typeof ENTITES_PUSH)[number];

/** Ordres qui font évoluer une ligne existante (check-in, annulation, avancement en cuisine) : jamais lus, seulement envoyés. */
export const COMMANDES_PUSH = ["ActionReservation", "ActionLigne"] as const;
export type CommandePush = (typeof COMMANDES_PUSH)[number];
export type TypeOperationPush = EntitePush | CommandePush;
export const ACTIONS_RESERVATION = ["CONFIRMER", "ANNULER", "CHECK_IN", "CHECK_OUT"] as const;
export type ActionReservation = (typeof ACTIONS_RESERVATION)[number];

export const ENTITES_PULL = [...ENTITES_PUSH] as const;
export type EntitePull = (typeof ENTITES_PULL)[number];

/** Un élément de `SyncPushDto.operations` (apps/api/src/sync/dto). */
export interface OperationPush {
  entiteType: TypeOperationPush;
  localId: string;
  remoteId?: string;
  operation: "CREATE" | "UPDATE";
  payload: Record<string, unknown>;
  /** Requis pour UPDATE — la valeur de `syncVersion` lue localement avant la
   * modification, comparée à celle du serveur pour détecter un conflit. */
  baseSyncVersion?: number;
  /** Heure de l'appareil au moment de l'action (ISO) : le serveur date ainsi les écritures qui s'additionnent
   * (mouvements de stock, lignes de commande) à leur vraie heure même envoyées plus tard. Borné côté serveur. */
  horodatageClient?: string;
}

/** Réponse de POST /sync/push : un résultat par opération, plus l'heure du serveur (mesure du décalage d'horloge). */
export interface ReponsePush {
  resultats: ResultatOperation[];
  serveurLe?: string;
}

/** Un élément de la réponse de POST /sync/push, un par opération envoyée,
 * dans le même ordre. Sur CONFLICT, `donneesServeur` est la ligne complète
 * telle qu'elle est actuellement en base — le serveur n'a rien appliqué. */
export interface ResultatOperation {
  localId: string;
  remoteId?: string;
  syncVersion?: number;
  statut: "SYNCED" | "CONFLICT" | "ERROR";
  message?: string;
  /** ERROR seulement : panne passagère (serveur ou base momentanément indisponible, opération déjà en cours). À
   * réessayer plus tard SANS compter un échec ; absent = refus définitif. */
  temporaire?: boolean;
  donneesServeur?: unknown;
  /** Entités enfants créées implicitement par un CREATE parent (ex. le
   * premier sous-compte d'un CompteCafeteria) — le miroir local doit y
   * chercher le remoteId à rattacher à ses propres lignes optimistes, sans
   * attendre le prochain pull (sinon doublon + enfants fantômes, bug du
   * 27/09/2026). */
  enfants?: EnfantCree[];
}

/** Mapping localId→remoteId d'une entité enfant créée implicitement par un
 * CREATE parent. EntitePull (pas EntitePush) : un enfant peut être une
 * entité non poussable directement (Client créé inline dans une
 * Reservation, Phase 16). */
export interface EnfantCree {
  entiteType: EntitePull;
  localId: string;
  remoteId: string;
  syncVersion?: number;
}

/** GET /sync/pull — une entrée par type d'entité demandé (ou tous ceux
 * autorisés pour le rôle si `entites` est omis), lignes brutes (pas
 * d'`include` : pas de sous-comptes/lignes imbriqués pour CompteCafeteria). */
export type ReponsePull = Partial<Record<EntitePull, unknown[]>> & { _meta?: MetaPull };

export interface MetaPull {
  /** Heure du serveur à la réponse. */
  serveurLe: string;
  /** Point de départ du prochain pull si rien n'est tronqué (heure du serveur moins une marge de relecture). */
  curseur: string;
  /** Types dont la page était pleine : il reste probablement des lignes à tirer (reprendre au dernier updatedAt). */
  tronque: EntitePull[];
  /** Éléments supprimés côté serveur depuis `depuis` — à retirer du miroir local. */
  suppressions: { entiteType: EntitePull; id: string; supprimeLe: string }[];
}

/**
 * Client HTTP typé pour l'API NestJS (jamais pour Supabase Auth lui-même —
 * voir supabase-auth.ts). `getAccessToken` est une fonction, pas une valeur
 * figée à la construction : le jeton change au fil du temps (rafraîchi), et
 * l'appelant (apps/desktop) reste seul responsable de le stocker/rafraîchir.
 *
 * `baseUrl` accepte une liste : chaque requête tente la dernière URL qui a
 * répondu puis les autres — indispensable sur mobile où le même serveur est
 * joignable par le câble USB (adb reverse → 127.0.0.1) ET par le Wi-Fi (IP
 * locale du PC, qui change avec le réseau). Le basculement ne se fait que
 * sur une erreur RÉSEAU (fetch qui jette), jamais sur une réponse HTTP —
 * une 4xx/5xx vient du bon serveur, aucune autre URL ne répondrait mieux.
 */
export class ClientApi {
  /** URL prioritaire : dernière qui a répondu (réessayée en premier). */
  private urlCourante: string;
  private readonly urls: string[];

  constructor(
    baseUrl: string | string[],
    /** Peut renvoyer une promesse : au démarrage instantané de l'app mobile, le jeton d'accès arrive quelques
     * instants après l'ouverture ; les requêtes l'attendent au lieu d'échouer. */
    private readonly getAccessToken: () => string | null | Promise<string | null>
  ) {
    this.urls = (Array.isArray(baseUrl) ? baseUrl : [baseUrl]).filter(Boolean);
    if (this.urls.length === 0) throw new Error("ClientApi : au moins une URL de base est requise.");
    this.urlCourante = this.urls[0];
  }

  /** URL qui répond actuellement — pour construire des liens (images, …). */
  get urlBase(): string {
    return this.urlCourante;
  }

  async moi(): Promise<ProfilConnecte> {
    return this.requete<ProfilConnecte>("/auth/me");
  }

  async listerChambres(filtres: FiltresChambres = {}): Promise<Chambre[]> {
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(filtres).filter(([, v]) => v !== undefined)) as Record<string, string>
    ).toString();
    return this.requete<Chambre[]>(`/chambres${params ? `?${params}` : ""}`);
  }

  async modifierStatutChambre(id: string, statut: string): Promise<Chambre> {
    return this.requete<Chambre>(`/chambres/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ statut }),
    });
  }

  /** PATRON uniquement côté API (RolesGuard). */
  async creerChambre(donnees: DonneesChambre): Promise<Chambre> {
    return this.requete<Chambre>("/chambres", { method: "POST", body: JSON.stringify(donnees) });
  }

  /** PATRON : tous champs ; RECEPTIONNISTE : statut/photos uniquement (le
   * contrôle par rôle est dans ChambresService.update, section 9.3). */
  async modifierChambre(id: string, donnees: DonneesModificationChambre): Promise<Chambre> {
    return this.requete<Chambre>(`/chambres/${id}`, { method: "PATCH", body: JSON.stringify(donnees) });
  }

  /** PATRON uniquement — DELETE réel (les chambres ne sont pas une donnée
   * financière ; l'API refuse si des réservations y sont rattachées). */
  async supprimerChambre(id: string): Promise<void> {
    return this.requete<void>(`/chambres/${id}`, { method: "DELETE" });
  }

  /**
   * PATRON — envoie une image (le serveur la redimensionne et la convertit en
   * WebP) et renvoie son URL publique. `corps` est un `FormData` avec le champ
   * `fichier` : un `File` côté navigateur/Electron, `{ uri, name, type }` côté
   * React Native — c'est l'appelant qui le construit, ce paquet reste neutre.
   */
  async televerserImage(corps: FormData, usage: UsageImage): Promise<{ url: string }> {
    return this.requete<{ url: string }>(`/media/images?usage=${usage}`, { method: "POST", body: corps });
  }

  /** PATRON — retire une image du stockage (URL de son propre hôtel seulement). */
  async supprimerImage(url: string): Promise<void> {
    await this.requete<unknown>("/media/images", { method: "DELETE", body: JSON.stringify({ url }) });
  }

  /** PATRON — coordonnées + contenu du site public de l'hôtel. */
  async obtenirSiteHotel(): Promise<SiteHotelEditable> {
    return this.requete<SiteHotelEditable>("/hotel-site");
  }

  /** PATRON — n'envoyer que les champs modifiés. */
  async modifierSiteHotel(donnees: Partial<SiteHotelEditable>): Promise<SiteHotelEditable> {
    return this.requete<SiteHotelEditable>("/hotel-site", { method: "PUT", body: JSON.stringify(donnees) });
  }

  // ---- Notifications ----

  /** Notifications de MON hôtel destinées à MON rôle ; `depuis` (ISO) = seulement les plus récentes. */
  async listerNotifications(options: { depuis?: string; limite?: number } = {}): Promise<ListeNotifications> {
    const params = new URLSearchParams();
    if (options.depuis) params.set("depuis", options.depuis);
    if (options.limite) params.set("limite", String(options.limite));
    const requete = params.toString();
    return this.requete<ListeNotifications>(`/notifications${requete ? `?${requete}` : ""}`);
  }

  async marquerNotificationLue(id: string): Promise<void> {
    await this.requete<unknown>(`/notifications/${id}/lue`, { method: "POST" });
  }

  async marquerToutesNotificationsLues(): Promise<void> {
    await this.requete<unknown>("/notifications/lues", { method: "POST" });
  }

  /** Enregistre ce téléphone (jeton FCM) au nom de l'utilisateur connecté. */
  async enregistrerAppareilPush(jeton: string, plateforme: "android" | "ios"): Promise<void> {
    await this.requete<unknown>("/notifications/appareils", { method: "POST", body: JSON.stringify({ jeton, plateforme }) });
  }

  /** À appeler à la déconnexion / au changement de profil : sans cela l'alerte d'un compte s'afficherait chez le suivant. */
  async retirerAppareilPush(jeton: string): Promise<void> {
    await this.requete<unknown>("/notifications/appareils", { method: "DELETE", body: JSON.stringify({ jeton }) });
  }

  /** Vrai si le serveur de l'hôtel répond — et c'est bien lui (pas un autre
   * service sur la même adresse, ex. un autre projet sur le port 3000). */
  async estJoignable(): Promise<boolean> {
    try {
      const sante = await this.requete<{ service?: string }>("/health");
      return sante.service === "hotel-chicago-api";
    } catch {
      return false;
    }
  }

  async recetteDuJour(): Promise<RecetteDuJour> {
    return this.requete<RecetteDuJour>("/dashboard/recette-du-jour");
  }

  async occupation(): Promise<Occupation> {
    return this.requete<Occupation>("/dashboard/occupation");
  }

  async stockBas(): Promise<Produit[]> {
    return this.requete<Produit[]>("/dashboard/stock-bas");
  }

  async ventesRecentes(limite = 6): Promise<VentesRecentes> {
    return this.requete<VentesRecentes>(`/dashboard/ventes-recentes?limite=${limite}`);
  }

  /** Recette d'un mois « AAAA-MM » — mêmes agrégats que le rapport PDF du mois. */
  async recetteDuMois(mois: string): Promise<RecetteDuMois> {
    return this.requete<RecetteDuMois>(`/dashboard/recette-du-mois?mois=${mois}`);
  }

  // ---------------------------------------------------------------------
  // Rapports mensuels PDF (cafétaria, réception) — remis au patron
  // ---------------------------------------------------------------------

  /** Génère (ou régénère) le rapport d'un département pour un mois.
   * Réservé au personnel de ce département — ou au patron si l'hôtel a
   * activé « le patron peut aussi opérer ». */
  async genererRapport(departement: DepartementRapport, mois: string): Promise<RapportMensuel> {
    return this.requete<RapportMensuel>("/rapports", {
      method: "POST",
      body: JSON.stringify({ departement, mois }),
    });
  }

  async listerRapports(mois?: string, departement?: DepartementRapport): Promise<RapportMensuel[]> {
    const params = new URLSearchParams();
    if (mois) params.set("mois", mois);
    if (departement) params.set("departement", departement);
    const requete = params.toString();
    return this.requete<RapportMensuel[]>(`/rapports${requete ? `?${requete}` : ""}`);
  }

  /** URL signée courte (5 min) pour ouvrir le PDF — visionneuse du téléphone
   * ou `shell.openExternal` côté desktop. */
  async urlRapport(id: string): Promise<{ url: string }> {
    return this.requete<{ url: string }>(`/rapports/${id}/telecharger`);
  }

  // ---------------------------------------------------------------------
  // Dépenses par département — saisies par la réception et la cafétaria,
  // consultées par le patron (le département vient du rôle, côté serveur).
  // ---------------------------------------------------------------------

  async listerDepenses(filtres: FiltresDepenses): Promise<Depense[]> {
    return this.requete<Depense[]>(`/depenses?${ClientApi.parametresDepenses(filtres)}`);
  }

  async creerDepense(donnees: CreerDepense): Promise<Depense> {
    return this.requete<Depense>("/depenses", { method: "POST", body: JSON.stringify(donnees) });
  }

  /** Correction, ou annulation définitive avec `{ annulee: true }`. */
  async modifierDepense(id: string, donnees: ModifierDepense): Promise<Depense> {
    return this.requete<Depense>(`/depenses/${id}`, { method: "PATCH", body: JSON.stringify(donnees) });
  }

  /** URL signée courte (5 min) du PDF des dépenses de la période. */
  async urlPdfDepenses(filtres: FiltresDepenses): Promise<{ url: string }> {
    return this.requete<{ url: string }>(`/depenses/pdf?${ClientApi.parametresDepenses(filtres)}`);
  }

  private static parametresDepenses(filtres: FiltresDepenses): string {
    const params = new URLSearchParams({ du: filtres.du, au: filtres.au });
    if (filtres.departement) params.set("departement", filtres.departement);
    return params.toString();
  }

  // ---------------------------------------------------------------------
  // Cafétaria — comptes et ventes
  // ---------------------------------------------------------------------

  async listerComptesCafeteria(statut?: StatutCompte): Promise<CompteCafeteria[]> {
    return this.requete<CompteCafeteria[]>(`/cafeteria/comptes${statut ? `?statut=${statut}` : ""}`);
  }

  async obtenirCompteCafeteria(id: string): Promise<CompteCafeteria> {
    return this.requete<CompteCafeteria>(`/cafeteria/comptes/${id}`);
  }

  /** Commande web retrouvée par sa référence courte (8 caractères du ticket).
   * 404 si inconnue, 409 si déjà réglée — la référence devient obsolète. */
  async trouverCompteParReference(reference: string): Promise<CompteCafeteria> {
    return this.requete<CompteCafeteria>(`/cafeteria/comptes/par-reference/${encodeURIComponent(reference.trim())}`);
  }

  async ouvrirCompteCafeteria(donnees: DonneesOuvrirCompte): Promise<CompteCafeteria> {
    return this.requete<CompteCafeteria>("/cafeteria/comptes", {
      method: "POST",
      body: JSON.stringify(donnees),
    });
  }

  async ajouterSousCompte(compteId: string, nom: string): Promise<SousCompte> {
    return this.requete<SousCompte>(`/cafeteria/comptes/${compteId}/sous-comptes`, {
      method: "POST",
      body: JSON.stringify({ nom }),
    });
  }

  /** PATRON : autorise (ou non) le patron à réaliser lui-même les opérations du quotidien (séparation des tâches). */
  async modifierReglagesHotel(donnees: { patronPeutOperer?: boolean; cuisineActivee?: boolean; commandeWebActivee?: boolean }): Promise<{ patronPeutOperer: boolean; cuisineActivee: boolean; commandeWebActivee: boolean }> {
    return this.requete<{ patronPeutOperer: boolean; cuisineActivee: boolean; commandeWebActivee: boolean }>("/hotel/reglages", { method: "PATCH", body: JSON.stringify(donnees) });
  }

  /** Produits les plus ajoutés aux comptes aujourd'hui (du plus au moins demandé). */
  async produitsPopulaires(): Promise<ProduitPopulaire[]> {
    return this.requete<ProduitPopulaire[]>("/cafeteria/produits-populaires");
  }

  async ajouterLigne(compteId: string, donnees: DonneesAjouterLigne): Promise<LigneCommande> {
    return this.requete<LigneCommande>(`/cafeteria/comptes/${compteId}/lignes`, {
      method: "POST",
      body: JSON.stringify(donnees),
    });
  }

  async encaisserCompte(compteId: string, donnees: DonneesEncaissement): Promise<VenteCafeteria[]> {
    return this.requete<VenteCafeteria[]>(`/cafeteria/comptes/${compteId}/encaisser`, {
      method: "POST",
      body: JSON.stringify(donnees),
    });
  }

  /** PATRON uniquement côté API — pas encore d'écran mobile qui l'appelle. */
  async annulerVenteCafeteria(id: string, motif: string): Promise<VenteCafeteria> {
    return this.requete<VenteCafeteria>(`/cafeteria/ventes/${id}/annuler`, {
      method: "POST",
      body: JSON.stringify({ motif }),
    });
  }

  // ---------------------------------------------------------------------
  // Menu (produits)
  // ---------------------------------------------------------------------

  async listerProduits(filtres: FiltresProduits = {}): Promise<Produit[]> {
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(filtres).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
    ).toString();
    return this.requete<Produit[]>(`/produits${params ? `?${params}` : ""}`);
  }

  /** PATRON uniquement côté API (RolesGuard) — CAFETARIA en lecture seule. */
  async creerProduit(donnees: DonneesProduit): Promise<Produit> {
    return this.requete<Produit>("/produits", { method: "POST", body: JSON.stringify(donnees) });
  }

  async modifierProduit(id: string, donnees: DonneesModificationProduit): Promise<Produit> {
    return this.requete<Produit>(`/produits/${id}`, { method: "PATCH", body: JSON.stringify(donnees) });
  }

  /** Associe (ou retire avec null) le code-barres d'un article — ouvert à la
   * cafétaria, qui ne peut rien modifier d'autre sur le produit. 409 si le
   * code est déjà pris par un autre produit de l'hôtel. */
  async associerCodeBarres(id: string, codeBarres: string | null): Promise<Produit> {
    return this.requete<Produit>(`/produits/${id}/code-barres`, { method: "PATCH", body: JSON.stringify({ codeBarres }) });
  }

  async supprimerProduit(id: string): Promise<void> {
    return this.requete<void>(`/produits/${id}`, { method: "DELETE" });
  }

  // ---------------------------------------------------------------------
  // Stock
  // ---------------------------------------------------------------------

  async listerMouvementsStock(produitId?: string): Promise<MouvementStock[]> {
    return this.requete<MouvementStock[]>(`/stock${produitId ? `?produitId=${produitId}` : ""}`);
  }

  async creerMouvementStock(donnees: DonneesMouvementStock): Promise<MouvementStock> {
    return this.requete<MouvementStock>("/stock", { method: "POST", body: JSON.stringify(donnees) });
  }

  /** Reconstitue les stocks théoriques sur la période pour lancer l'évaluateur d'inventaire. */
  async preparerInventaire(dateDebut: string, dateFin: string): Promise<LignePreparationInventaire[]> {
    return this.requete<LignePreparationInventaire[]>(`/stock/inventaire/preparer?debut=${dateDebut}&fin=${dateFin}`);
  }

  /** Enregistre un inventaire physique et génère son PDF. */
  async creerInventaire(dto: {
    dateDebut: string;
    dateFin: string;
    titre?: string;
    items: Array<{ produitId: string; stockPhysique: number; note?: string }>;
  }): Promise<InventairePhysique> {
    return this.requete<InventairePhysique>("/stock/inventaires", { method: "POST", body: JSON.stringify(dto) });
  }

  /** Liste l'historique des inventaires physiques. */
  async listerInventaires(): Promise<InventairePhysique[]> {
    return this.requete<InventairePhysique[]>("/stock/inventaires");
  }

  /** URL signée (5 min) pour télécharger le PDF d'un inventaire. */
  async urlInventaire(id: string): Promise<{ url: string }> {
    return this.requete<{ url: string }>(`/stock/inventaires/${id}/telecharger`);
  }

  // ---------------------------------------------------------------------
  // Réservations et facturation (RECEPTIONNISTE + PATRON uniquement)
  // ---------------------------------------------------------------------

  async listerReservations(filtres: FiltresReservations = {}): Promise<Reservation[]> {
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(filtres).filter(([, v]) => v !== undefined)) as Record<string, string>
    ).toString();
    return this.requete<Reservation[]>(`/reservations${params ? `?${params}` : ""}`);
  }

  async obtenirReservation(id: string): Promise<Reservation> {
    return this.requete<Reservation>(`/reservations/${id}`);
  }

  async creerReservation(donnees: DonneesReservation): Promise<Reservation> {
    return this.requete<Reservation>("/reservations", { method: "POST", body: JSON.stringify(donnees) });
  }

  async modifierReservation(id: string, donnees: DonneesModificationReservation): Promise<Reservation> {
    return this.requete<Reservation>(`/reservations/${id}`, { method: "PATCH", body: JSON.stringify(donnees) });
  }

  async confirmerReservation(id: string): Promise<Reservation> {
    return this.requete<Reservation>(`/reservations/${id}/confirmer`, { method: "POST" });
  }

  async annulerReservation(id: string, motif: string): Promise<ReservationAnnulee> {
    return this.requete<ReservationAnnulee>(`/reservations/${id}/annuler`, {
      method: "POST",
      body: JSON.stringify({ motif }),
    });
  }

  async checkIn(reservationId: string): Promise<ResultatCheckInOut> {
    return this.requete<ResultatCheckInOut>(`/reservations/${reservationId}/check-in`, { method: "POST" });
  }

  async checkOut(reservationId: string): Promise<ResultatCheckInOut> {
    return this.requete<ResultatCheckInOut>(`/reservations/${reservationId}/check-out`, { method: "POST" });
  }

  async listerFactures(reservationId?: string): Promise<Facture[]> {
    return this.requete<Facture[]>(`/factures${reservationId ? `?reservationId=${reservationId}` : ""}`);
  }

  /** PATRON côté matrice 9.3 (l'API autorise aussi RECEPTIONNISTE, voir
   * factures.controller.ts) — l'UI n'expose l'annulation qu'au patron. */
  async annulerFacture(id: string, motif: string): Promise<Facture> {
    return this.requete<Facture>(`/factures/${id}/annuler`, {
      method: "POST",
      body: JSON.stringify({ motif }),
    });
  }

  // ---------------------------------------------------------------------
  // Clients (répertoire) et taux de change
  // ---------------------------------------------------------------------

  async listerClients(q?: string): Promise<ClientAvecSejours[]> {
    return this.requete<ClientAvecSejours[]>(`/clients${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  }

  async obtenirClient(id: string): Promise<ClientAvecSejours> {
    return this.requete<ClientAvecSejours>(`/clients/${id}`);
  }

  /** PATCH /clients/:id — fiche complète (pièce d'identité, notes). */
  async modifierClient(id: string, donnees: DonneesModificationClient): Promise<ClientAvecSejours> {
    return this.requete<ClientAvecSejours>(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(donnees) });
  }

  /** GET /dashboard/journee-reception — remise de poste réception. */
  async journeeReception(): Promise<JourneeReception> {
    return this.requete<JourneeReception>("/dashboard/journee-reception");
  }

  /** Taux du jour en vigueur, ou null si le patron n'en a jamais saisi —
   * l'écran d'encaissement s'en sert pour l'aperçu du paiement croisé. */
  async tauxActuel(): Promise<TauxChange | null> {
    return this.requete<TauxChange | null>("/taux-change/actuel");
  }

  /** PATRON uniquement côté API. */
  async listerTauxChange(): Promise<TauxChange[]> {
    return this.requete<TauxChange[]>("/taux-change");
  }

  async creerTauxChange(cdfParUsd: number): Promise<TauxChange> {
    return this.requete<TauxChange>("/taux-change", {
      method: "POST",
      body: JSON.stringify({ cdfParUsd }),
    });
  }

  async creerFacture(donnees: DonneesFacture): Promise<Facture> {
    return this.requete<Facture>("/factures", { method: "POST", body: JSON.stringify(donnees) });
  }

  async obtenirFacture(id: string): Promise<Facture> {
    return this.requete<Facture>(`/factures/${id}`);
  }

  /** Consommations cafétaria facturées sur le séjour (paiement
   * FACTURE_CHAMBRE) — utilisé pour les lister sur le reçu chambre. */
  async listerVentesCafeteria(reservationLieeId?: string): Promise<VenteCafeteria[]> {
    return this.requete<VenteCafeteria[]>(
      `/cafeteria/ventes${reservationLieeId ? `?reservationLieeId=${reservationLieeId}` : ""}`
    );
  }

  /** PATCH /cafeteria/lignes/:id/statut — avance le statut d'une ligne (cuisine). */
  async majStatutLigne(ligneId: string, statut: StatutLigne): Promise<LigneCommande> {
    return this.requete<LigneCommande>(`/cafeteria/lignes/${ligneId}/statut`, {
      method: "PATCH",
      body: JSON.stringify({ statut }),
    });
  }

  /** GET /cafeteria/cuisine — commandes actives pour l'écran de cuisine. */
  async lignesPourCuisine(): Promise<unknown[]> {
    return this.requete<unknown[]>("/cafeteria/cuisine");
  }

  /** GET /cafeteria/menu-du-jour — menu actif aujourd'hui, null si non défini. */
  async menuDuJour(): Promise<MenuDuJour | null> {
    return this.requete<MenuDuJour | null>("/cafeteria/menu-du-jour");
  }

  /** PUT /cafeteria/menu-du-jour — définit le menu du jour (crée ou remplace). */
  async definirMenuDuJour(items: Array<{ produitId: string; prixSpecial?: number; deviseSpeciale?: string }>): Promise<MenuDuJour> {
    return this.requete<MenuDuJour>("/cafeteria/menu-du-jour", {
      method: "PUT",
      body: JSON.stringify({ items }),
    });
  }

  /** DELETE /cafeteria/menu-du-jour/items/:itemId — retire un produit du menu du jour. */
  async supprimerItemMenuDuJour(itemId: string): Promise<void> {
    await this.requete<void>(`/cafeteria/menu-du-jour/items/${itemId}`, { method: "DELETE" });
  }

  // ---------------------------------------------------------------------
  // Utilisateurs (PATRON uniquement côté API)
  // ---------------------------------------------------------------------

  async listerUtilisateurs(): Promise<Utilisateur[]> {
    return this.requete<Utilisateur[]>("/utilisateurs");
  }

  async creerUtilisateur(donnees: DonneesCreationUtilisateur): Promise<Utilisateur> {
    return this.requete<Utilisateur>("/utilisateurs", { method: "POST", body: JSON.stringify(donnees) });
  }

  async changerStatutUtilisateur(id: string, actif: boolean): Promise<Utilisateur> {
    return this.requete<Utilisateur>(`/utilisateurs/${id}`, { method: "PATCH", body: JSON.stringify({ actif }) });
  }

  /** Modification complète d'un compte (Phase 16) : nom, email, mot de
   * passe et/ou actif — le serveur propage email/mot de passe à Supabase
   * Auth (rotation des identifiants quand un employé part). */
  async modifierUtilisateur(id: string, donnees: DonneesModificationUtilisateur): Promise<Utilisateur> {
    return this.requete<Utilisateur>(`/utilisateurs/${id}`, { method: "PATCH", body: JSON.stringify(donnees) });
  }

  // ---------------------------------------------------------------------
  // Synchronisation hors-ligne
  // ---------------------------------------------------------------------

  /** Un seul appel peut mélanger plusieurs types d'entités, traités dans
   * l'ordre du tableau. Ne rejette jamais sur un `ERROR`/`CONFLICT`
   * individuel — seule une vraie erreur réseau/HTTP lève. */
  async syncPush(operations: OperationPush[]): Promise<ReponsePush> {
    return this.requete<ReponsePush>("/sync/push", {
      method: "POST",
      body: JSON.stringify({ operations }),
    });
  }

  /** `depuis` : horodatage ISO du dernier pull réussi (capturé côté client
   * avant l'appel précédent, pas dérivé des lignes reçues — voir MoteurSync).
   * `entites` omis = tous les types autorisés pour le rôle courant. */
  async syncPull(depuis: string, entites?: EntitePull[], limite?: number): Promise<ReponsePull> {
    const params = new URLSearchParams({ depuis });
    if (entites && entites.length > 0) params.set("entites", entites.join(","));
    if (limite) params.set("limite", String(limite));
    return this.requete<ReponsePull>(`/sync/pull?${params.toString()}`);
  }

  protected async requete<T>(chemin: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();
    // Un FormData fixe lui-même son Content-Type (avec la frontière multipart).
    const estFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const enTetes = {
      ...(estFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    // La dernière URL gagnante d'abord, puis les candidates : un câble USB
    // ou un changement de Wi-Fi ne laissent jamais l'app sans serveur tant
    // qu'AU MOINS une route fonctionne.
    const candidates = [this.urlCourante, ...this.urls.filter((u) => u !== this.urlCourante)];
    let reponse: Response | null = null;
    for (const url of candidates) {
      try {
        // Délai maximum : sans lui, une connexion « captive » (Wi-Fi sans internet) ferait attendre l'écran indéfiniment.
        reponse = await fetch(`${url}${chemin}`, { signal: signalAvecDelai(estFormData ? 120_000 : 30_000), ...options, headers: enTetes });
        this.urlCourante = url;
        break;
      } catch {
        // Réseau mort sur cette URL — on tente la suivante.
      }
    }
    if (!reponse) {
      // statusCode 0 = aucune réponse reçue (internet coupé, serveur injoignable) —
      // distinct d'une vraie erreur HTTP, pour que l'appelant puisse le traiter à part.
      throw new ErreurApi(
        0,
        "Impossible de joindre le serveur de l'hôtel. Vérifiez la connexion internet puis réessayez."
      );
    }

    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => ({}));
      throw new ErreurApi(reponse.status, messageErreurHttp(reponse.status, corps));
    }

    // Corps vide possible sans 204 : NestJS sérialise `null`/`undefined` en
    // réponse vide (ex. GET /taux-change/actuel avant toute saisie, ou un
    // DELETE qui retourne void) — `reponse.json()` lèverait « JSON Parse
    // error: Unexpected end of input ».
    try {
      return await reponse.json();
    } catch {
      return undefined as T;
    }
  }
}


/**
 * Phrase en français pour l'utilisateur à partir de la réponse d'erreur du serveur. Les messages métier du serveur (déjà en français,
 * ex. « Cette chambre est déjà réservée… ») sont gardés ; la liste des erreurs de validation est jointe ; sans message exploitable, on
 * dit quelque chose d'humain selon le code — jamais « Erreur 500 sur /factures/… ».
 */
export function messageErreurHttp(statut: number, corps: unknown): string {
  const brut = (corps as { message?: unknown } | null)?.message;
  const texte = Array.isArray(brut) ? brut.filter((m) => typeof m === "string").join(" ") : typeof brut === "string" ? brut : "";
  const technique = /^(internal server error|bad request|unauthorized|forbidden|not found|conflict|service unavailable|bad gateway)$/i.test(texte.trim()) || /prisma|invocation|stack|undefined|ECONN/i.test(texte);
  if (texte && !technique) return texte;
  if (statut === 400 || statut === 422) return "Les informations saisies sont incomplètes ou incorrectes.";
  if (statut === 401) return "Votre session a pris fin. Reconnectez-vous.";
  if (statut === 403) return "Vous n'avez pas le droit d'effectuer cette action.";
  if (statut === 404) return "Élément introuvable. Il a peut-être été supprimé.";
  if (statut === 409) return "Cette action n'est plus possible : les données ont changé entre-temps. Actualisez puis réessayez.";
  if (statut === 413) return "Le fichier envoyé est trop volumineux.";
  if (statut === 429) return "Trop de demandes en peu de temps. Patientez un instant puis réessayez.";
  if (statut >= 500) return "Le serveur rencontre un problème. Réessayez dans un instant.";
  return "Une erreur est survenue. Réessayez.";
}
