import {
  Chambre,
  Client,
  CompteCafeteria,
  Devise,
  Facture,
  LigneCommande,
  ModePaiement,
  MouvementStock,
  Occupation,
  Produit,
  RecetteDuJour,
  Reservation,
  Role,
  SiteHotelEditable,
  SousCompte,
  StatutChambre,
  StatutCompte,
  StatutReservation,
  UsageImage,
  UtilisateurAuthentifie,
  VenteCafeteria,
  VentesRecentes,
} from "@hotel-chicago/types";

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
  photo?: string;
  stockActuel?: number;
  seuilAlerte?: number;
}

/** Champs de apps/api/src/produits/dto/update-produit.dto.ts (stockActuel
 * volontairement absent — seul le module Stock peut changer la quantité). */
export interface DonneesModificationProduit {
  nom?: string;
  categorie?: string;
  prix?: number;
  devise?: Devise;
  photo?: string;
  seuilAlerte?: number;
  actif?: boolean;
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

/** PAR_SOUS_COMPTE/PARTAGE_EGAL existent côté API mais pas encore ici — voir
 * le plan (UI de répartition non construite dans cette passe). */
export interface DonneesEncaissement {
  mode: "GROUPE";
  modePaiement: ModePaiement;
}

export interface FiltresReservations {
  statut?: StatutReservation;
  chambreId?: string;
}

/** Champs de apps/api/src/reservations/dto/create-reservation.dto.ts —
 * `clientId` (client existant) XOR `client` (nouveau, créé inline). */
export interface DonneesReservation {
  chambreId: string;
  clientId?: string;
  client?: { nom: string; telephone?: string; email?: string };
  dateArrivee: string;
  dateDepart: string;
  acompte?: number;
}

/** Champs de apps/api/src/reservations/dto/update-reservation.dto.ts. */
export interface DonneesModificationReservation {
  dateArrivee?: string;
  dateDepart?: string;
  acompte?: number;
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
] as const;
export type EntitePush = (typeof ENTITES_PUSH)[number];

export const ENTITES_PULL = [...ENTITES_PUSH, "Client", "Facture", "VenteCafeteria"] as const;
export type EntitePull = (typeof ENTITES_PULL)[number];

/** Un élément de `SyncPushDto.operations` (apps/api/src/sync/dto). */
export interface OperationPush {
  entiteType: EntitePush;
  localId: string;
  remoteId?: string;
  operation: "CREATE" | "UPDATE";
  payload: Record<string, unknown>;
  /** Requis pour UPDATE — la valeur de `syncVersion` lue localement avant la
   * modification, comparée à celle du serveur pour détecter un conflit. */
  baseSyncVersion?: number;
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
export type ReponsePull = Partial<Record<EntitePull, unknown[]>>;

/**
 * Client HTTP typé pour l'API NestJS (jamais pour Supabase Auth lui-même —
 * voir supabase-auth.ts). `getAccessToken` est une fonction, pas une valeur
 * figée à la construction : le jeton change au fil du temps (rafraîchi), et
 * l'appelant (apps/desktop) reste seul responsable de le stocker/rafraîchir.
 */
export class ClientApi {
  constructor(
    private readonly baseUrl: string,
    private readonly getAccessToken: () => string | null
  ) {}

  async moi(): Promise<UtilisateurAuthentifie> {
    return this.requete<UtilisateurAuthentifie>("/auth/me");
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

  // ---------------------------------------------------------------------
  // Cafétaria — comptes et ventes
  // ---------------------------------------------------------------------

  async listerComptesCafeteria(statut?: StatutCompte): Promise<CompteCafeteria[]> {
    return this.requete<CompteCafeteria[]>(`/cafeteria/comptes${statut ? `?statut=${statut}` : ""}`);
  }

  async obtenirCompteCafeteria(id: string): Promise<CompteCafeteria> {
    return this.requete<CompteCafeteria>(`/cafeteria/comptes/${id}`);
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
  async syncPush(operations: OperationPush[]): Promise<ResultatOperation[]> {
    const reponse = await this.requete<{ resultats: ResultatOperation[] }>("/sync/push", {
      method: "POST",
      body: JSON.stringify({ operations }),
    });
    return reponse.resultats;
  }

  /** `depuis` : horodatage ISO du dernier pull réussi (capturé côté client
   * avant l'appel précédent, pas dérivé des lignes reçues — voir MoteurSync).
   * `entites` omis = tous les types autorisés pour le rôle courant. */
  async syncPull(depuis: string, entites?: EntitePull[]): Promise<ReponsePull> {
    const params = new URLSearchParams({ depuis });
    if (entites && entites.length > 0) params.set("entites", entites.join(","));
    return this.requete<ReponsePull>(`/sync/pull?${params.toString()}`);
  }

  private async requete<T>(chemin: string, options: RequestInit = {}): Promise<T> {
    const token = this.getAccessToken();
    // Un FormData fixe lui-même son Content-Type (avec la frontière multipart).
    const estFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    let reponse: Response;
    try {
      reponse = await fetch(`${this.baseUrl}${chemin}`, {
        ...options,
        headers: {
          ...(estFormData ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });
    } catch {
      // statusCode 0 = aucune réponse reçue (internet coupé, serveur injoignable) —
      // distinct d'une vraie erreur HTTP, pour que l'appelant puisse le traiter à part.
      throw new ErreurApi(
        0,
        "Impossible de joindre le serveur de l'hôtel. Vérifiez la connexion internet ou l'URL de l'API dans les Paramètres."
      );
    }

    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => ({}));
      throw new ErreurApi(reponse.status, corps.message || `Erreur ${reponse.status} sur ${chemin}.`);
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
