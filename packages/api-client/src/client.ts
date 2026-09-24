import { Chambre, Occupation, Produit, RecetteDuJour, UtilisateurAuthentifie, VentesRecentes } from "@hotel-chicago/types";

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
