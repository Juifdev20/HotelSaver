import type { Devise, HotelAvecValidite, HotelCree, MethodePaiementLicence, StatutLicence } from "@hotel-chicago/types";
import { ErreurApi } from "./client";

/** Champs de apps/api/src/super-admin/dto/creer-hotel.dto.ts (logoUrl omis :
 * aucun composant de téléversement n'existe nulle part dans ce projet, voir
 * DECISIONS.md Phases 4/5/6/7). */
export interface DonneesCreationHotel {
  nom: string;
  sousDomaine: string;
  emailContact?: string;
  telephoneContact?: string;
  adresse?: string;
}

/** Champs de apps/api/src/super-admin/dto/enregistrer-paiement.dto.ts
 * (Phase 12, suivi manuel des paiements). */
export interface DonneesEnregistrementPaiement {
  montant: number;
  devise: Devise;
  methode: MethodePaiementLicence;
  periodeCouverteJusquau: string;
  note?: string;
}

/** Champ de apps/api/src/super-admin/dto/ajouter-domaine.dto.ts
 * (Phase 13, domaines personnalisés — onboarding manuel uniquement). */
export interface DonneesAjoutDomaine {
  domaine: string;
}

/**
 * Copie conforme de ClientApi (client.ts), mais pour les routes
 * /super-admin/hotels — identité d'authentification différente
 * (SuperAdminAuthentifie, pas UtilisateurAuthentifie), voir DECISIONS.md
 * Phase 3 : aussi net de sens de garder ce client séparé que de garder
 * SuperAdminAuthGuard séparé de SupabaseAuthGuard côté API.
 */
export class ClientSuperAdmin {
  constructor(
    private readonly baseUrl: string,
    private readonly getAccessToken: () => string | null
  ) {}

  async listerHotels(): Promise<HotelAvecValidite[]> {
    return this.requete<HotelAvecValidite[]>("/super-admin/hotels");
  }

  async creerHotel(dto: DonneesCreationHotel): Promise<HotelCree> {
    return this.requete<HotelCree>("/super-admin/hotels", {
      method: "POST",
      body: JSON.stringify(dto),
    });
  }

  async changerStatutHotel(id: string, statutLicence: StatutLicence): Promise<HotelCree> {
    return this.requete<HotelCree>(`/super-admin/hotels/${id}/statut`, {
      method: "PATCH",
      body: JSON.stringify({ statutLicence }),
    });
  }

  async enregistrerPaiement(hotelId: string, dto: DonneesEnregistrementPaiement) {
    return this.requete(`/super-admin/hotels/${hotelId}/paiements`, {
      method: "POST",
      body: JSON.stringify(dto),
    });
  }

  async ajouterDomaine(hotelId: string, dto: DonneesAjoutDomaine): Promise<HotelCree> {
    return this.requete<HotelCree>(`/super-admin/hotels/${hotelId}/domaine`, {
      method: "POST",
      body: JSON.stringify(dto),
    });
  }

  async verifierDomaine(hotelId: string): Promise<HotelCree> {
    return this.requete<HotelCree>(`/super-admin/hotels/${hotelId}/domaine/verifier`, { method: "POST" });
  }

  async retirerDomaine(hotelId: string): Promise<HotelCree> {
    return this.requete<HotelCree>(`/super-admin/hotels/${hotelId}/domaine`, { method: "DELETE" });
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
      throw new ErreurApi(0, "Impossible de joindre le serveur. Vérifiez la connexion internet ou l'URL de l'API.");
    }

    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => ({}));
      throw new ErreurApi(reponse.status, corps.message || `Erreur ${reponse.status} sur ${chemin}.`);
    }
    if (reponse.status === 204) return undefined as T;
    return reponse.json();
  }
}
