import type { DonneesFormule, FormuleAdminVue, ParametresPlateformeVue, PaiementAbonnementVue, Devise, HotelAvecValidite, HotelCree, MethodePaiementLicence, StatutLicence } from "@hotel-chicago/types";
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

/** Ligne de la liste de suivi des paiements d'abonnement (réponse de GET /super-admin/paiements-abonnement). */
export interface PaiementAbonnementSupport extends PaiementAbonnementVue {
  hotelId: string;
  hotelNom: string;
  sousDomaine: string;
  referenceDemande: string | null;
  referenceFournisseur: string | null;
}

/** Un paiement d'abonnement d'un hôtel vu par le super-admin (GET /super-admin/hotels/:id/paiements), annulés compris. */
export interface PaiementLicenceSuperAdmin {
  id: string;
  montant: number;
  devise: Devise;
  methode: MethodePaiementLicence;
  periodeCouverteJusquau: string;
  note: string | null;
  createdAt: string;
  /** MANUEL = saisi par le support (annulable) ; EN_LIGNE = Mobile Money réellement reçu (jamais annulable). */
  source: "MANUEL" | "EN_LIGNE";
  enregistreParNom: string | null;
  annuleLe: string | null;
  motifAnnulation: string | null;
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

  /** Paiements d'abonnement en ligne (tous hôtels) : en attente, réussis, échoués. */
  async listerPaiementsAbonnement(limite = 100): Promise<PaiementAbonnementSupport[]> {
    return this.requete<PaiementAbonnementSupport[]>(`/super-admin/paiements-abonnement?limite=${limite}`);
  }

  /** Revérifie un paiement auprès de ScanLinkPay (même classé en échec) et crédite l'hôtel s'il a bien abouti. */
  async reverifierPaiementAbonnement(id: string): Promise<PaiementAbonnementVue> {
    return this.requete<PaiementAbonnementVue>(`/super-admin/paiements-abonnement/${encodeURIComponent(id)}/reverifier`, { method: "POST" });
  }

  /** Formules d'abonnement : prix, plafond de chambres, fonctions incluses — tout se règle ici. */
  async listerFormules(): Promise<FormuleAdminVue[]> {
    return this.requete<FormuleAdminVue[]>("/super-admin/formules");
  }

  async creerFormule(dto: DonneesFormule & { code: string }): Promise<FormuleAdminVue> {
    return this.requete<FormuleAdminVue>("/super-admin/formules", { method: "POST", body: JSON.stringify(dto) });
  }

  async modifierFormule(code: string, dto: Partial<Omit<DonneesFormule, "code">>): Promise<FormuleAdminVue> {
    return this.requete<FormuleAdminVue>(`/super-admin/formules/${encodeURIComponent(code)}`, { method: "PATCH", body: JSON.stringify(dto) });
  }

  async supprimerFormule(code: string): Promise<void> {
    await this.requete<{ ok: true }>(`/super-admin/formules/${encodeURIComponent(code)}`, { method: "DELETE" });
  }

  async lireParametresAbonnement(): Promise<ParametresPlateformeVue> {
    return this.requete<ParametresPlateformeVue>("/super-admin/parametres-abonnement");
  }

  async modifierParametresAbonnement(dto: Partial<ParametresPlateformeVue>): Promise<ParametresPlateformeVue> {
    return this.requete<ParametresPlateformeVue>("/super-admin/parametres-abonnement", { method: "PATCH", body: JSON.stringify(dto) });
  }

  /** Attribue la formule d'un hôtel sans paiement (hôtel créé à la main, geste commercial). null = aucune. */
  async changerFormuleHotel(hotelId: string, formule: string | null): Promise<{ id: string; formule: string | null }> {
    return this.requete(`/super-admin/hotels/${encodeURIComponent(hotelId)}/formule`, { method: "PATCH", body: JSON.stringify({ formule }) });
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

  /** Numéro de connexion et/ou nouveau mot de passe du patron (15/10/2026). */
  async modifierPatron(hotelId: string, dto: { telephone?: string; motDePasse?: string }) {
    return this.requete(`/super-admin/hotels/${hotelId}/patron`, {
      method: "PATCH",
      body: JSON.stringify(dto),
    });
  }

  async listerPaiements(hotelId: string): Promise<PaiementLicenceSuperAdmin[]> {
    return this.requete<PaiementLicenceSuperAdmin[]>(`/super-admin/hotels/${hotelId}/paiements`);
  }

  /** Annule un paiement saisi à la main (motif obligatoire, 17/10/2026) ; renvoie la liste à jour. */
  async annulerPaiement(hotelId: string, paiementId: string, motif: string): Promise<PaiementLicenceSuperAdmin[]> {
    return this.requete<PaiementLicenceSuperAdmin[]>(`/super-admin/hotels/${hotelId}/paiements/${paiementId}/annuler`, {
      method: "POST",
      body: JSON.stringify({ motif }),
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
