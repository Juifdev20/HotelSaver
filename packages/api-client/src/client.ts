import {
  Chambre,
  CompteCafeteria,
  Devise,
  LigneCommande,
  ModePaiement,
  MouvementStock,
  Occupation,
  Produit,
  RecetteDuJour,
  SousCompte,
  StatutCompte,
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

  private async requete<T>(chemin: string, options: RequestInit = {}): Promise<T> {
    const token = this.getAccessToken();
    let reponse: Response;
    try {
      reponse = await fetch(`${this.baseUrl}${chemin}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
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

    if (reponse.status === 204) {
      return undefined as T;
    }
    return reponse.json();
  }
}
