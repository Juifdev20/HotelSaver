import { Chambre, UtilisateurAuthentifie } from "@hotel-chicago/types";

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

  private async requete<T>(chemin: string, options: RequestInit = {}): Promise<T> {
    const token = this.getAccessToken();
    const reponse = await fetch(`${this.baseUrl}${chemin}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

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
