// Types partagés — minimal en Phase 1 (juste ce qu'il faut pour l'Auth/RBAC).
// Complété au fur et à mesure des Phases 2+ avec les DTO métier
// (Chambres, Réservations, Cafétaria...).

/** Doit rester synchronisé avec l'enum `Role` de packages/database/prisma/schema.prisma */
export enum Role {
  RECEPTIONNISTE = "RECEPTIONNISTE",
  CAFETARIA = "CAFETARIA",
  PATRON = "PATRON",
}

/** Doit rester synchronisé avec l'enum `Devise` de packages/database/prisma/schema.prisma */
export enum Devise {
  USD = "USD",
  CDF = "CDF",
}

/** Utilisateur authentifié attaché à la requête par le AuthGuard (apps/api). */
export interface UtilisateurAuthentifie {
  /** Utilisateur.id (Prisma), pas le supabaseAuthId brut */
  userId: string;
  supabaseAuthId: string;
  role: Role;
  nom: string;
  hotelId: string;
}

/** Réponse de GET /auth/me : l'utilisateur + l'hôtel auquel il appartient (affichés dans les
 * apps : jamais un nom d'hôtel codé en dur). `hotelSlogan` = celui défini par le patron. */
export interface ProfilConnecte extends UtilisateurAuthentifie {
  hotelNom: string;
  hotelSlogan: string | null;
}

/** Super-admin authentifié attaché à la requête par SuperAdminAuthGuard
 * (apps/api) — indépendant de tout hôtel, voir SuperAdmin dans le schéma
 * Prisma et DECISIONS.md (Phase 3). */
export interface SuperAdminAuthentifie {
  id: string;
  supabaseAuthId: string;
  nom: string;
}

/** Doit rester synchronisé avec l'enum `StatutChambre` du schéma Prisma. */
export enum StatutChambre {
  LIBRE = "LIBRE",
  OCCUPEE = "OCCUPEE",
  RESERVEE = "RESERVEE",
  NETTOYAGE = "NETTOYAGE",
}

/**
 * Forme d'une Chambre telle que sérialisée par l'API (JSON) — pas le type
 * Prisma lui-même : les apps clientes (Electron, mobile, futur site) ne
 * doivent jamais dépendre de @hotel-chicago/database. `prixParNuit` est une
 * chaîne : Prisma sérialise ses champs Decimal en JSON via leur `toJSON()`
 * (qui renvoie une chaîne), jamais un `number` — à parser explicitement
 * (`Number(...)`) avant tout calcul côté client.
 */
export interface Chambre {
  id: string;
  numero: string;
  type: string;
  prixParNuit: string;
  devise: Devise;
  statut: StatutChambre;
  photos: string[];
  updatedAt: string;
  syncVersion: number;
}

/** Forme JSON d'un Produit (Decimal → string, voir Chambre). */
export interface Produit {
  id: string;
  nom: string;
  categorie: string;
  prix: string;
  devise: Devise;
  photo: string | null;
  stockActuel: string;
  seuilAlerte: string;
  actif: boolean;
  /** Présents en base (comme Chambre) mais absents jusqu'ici de ce type —
   * ajoutés pour le miroir hors ligne Cafétaria (Phase 6, 26/09/2026), voir
   * apps/mobile/src/stockage/stockageLocalMobile.ts. */
  updatedAt: string;
  syncVersion: number;
}

/** Deux montants séparés, jamais fusionnés (section 9.4). */
export interface MontantsParDevise {
  montantUSD: number;
  montantCDF: number;
}

/** GET /dashboard/recette-du-jour — `chambres`/`cafeteria` absents selon le rôle. */
export interface RecetteDuJour {
  chambres?: MontantsParDevise;
  cafeteria?: MontantsParDevise;
  total: MontantsParDevise;
}

/** GET /dashboard/occupation */
export interface Occupation {
  total: number;
  libres: number;
  occupees: number;
  reservees: number;
  enNettoyage: number;
  tauxOccupationPourcent: number;
}

/** Une ligne de GET /dashboard/ventes-recentes, côté chambres (encaissement d'un séjour). */
export interface FactureRecente {
  id: string;
  numeroRecu: string;
  createdAt: string;
  annuleLe: string | null;
  montantTotalUSD: string;
  montantTotalCDF: string;
  reservation: {
    chambre: { numero: string };
    client: { nom: string };
  };
}

/** Une ligne de GET /dashboard/ventes-recentes, côté cafétaria. */
export interface VenteCafeteriaRecente {
  id: string;
  numeroRecu: string;
  createdAt: string;
  annuleLe: string | null;
  montantTotalUSD: string;
  montantTotalCDF: string;
}

/** GET /dashboard/ventes-recentes — les deux listes triées par date décroissante,
 * `factures`/`ventesCafeteria` vides (jamais absentes) selon le rôle. */
export interface VentesRecentes {
  factures: FactureRecente[];
  ventesCafeteria: VenteCafeteriaRecente[];
}

/** Doit rester synchronisé avec l'enum `StatutCompte` du schéma Prisma. */
export enum StatutCompte {
  OUVERT = "OUVERT",
  FERME = "FERME",
}

/** Doit rester synchronisé avec l'enum `ModePaiement` du schéma Prisma. */
export enum ModePaiement {
  CASH = "CASH",
  MOBILE_MONEY = "MOBILE_MONEY",
  FACTURE_CHAMBRE = "FACTURE_CHAMBRE",
}

/** Doit rester synchronisé avec apps/api/src/cafeteria/dto/encaisser-compte.dto.ts
 * (pas un enum Prisma — un champ libre côté service). */
export const MODES_ENCAISSEMENT = ["GROUPE", "PAR_SOUS_COMPTE", "PARTAGE_EGAL"] as const;
export type ModeEncaissement = (typeof MODES_ENCAISSEMENT)[number];

/** Forme JSON d'une LigneCommande (Decimal → string, voir Chambre), avec le
 * produit inclus (voir INCLUDE_COMPTE_COMPLET côté API). */
export interface LigneCommande {
  id: string;
  sousCompteId: string;
  produitId: string;
  quantite: string;
  prixUnitaire: string;
  devise: Devise;
  produit: Produit;
}

export interface SousCompte {
  id: string;
  compteId: string;
  nom: string;
  lignes: LigneCommande[];
}

/** Forme JSON d'une VenteCafeteria (Decimal → string, voir Chambre). */
export interface VenteCafeteria {
  id: string;
  compteId: string;
  montantTotalUSD: string;
  montantTotalCDF: string;
  modePaiement: ModePaiement;
  deviseRegleeParClient: Devise | null;
  montantRegleParClient: string | null;
  tauxChangeApplique: string | null;
  deviseMonnaieRendue: Devise | null;
  montantMonnaieRendue: string | null;
  reservationLieeId: string | null;
  numeroRecu: string;
  imprimeLe: string | null;
  annuleLe: string | null;
  motifAnnulation: string | null;
  createdAt: string;
}

/** Forme JSON d'un CompteCafeteria, avec sous-comptes/lignes/ventes inclus
 * (voir INCLUDE_COMPTE_COMPLET dans apps/api/src/cafeteria/cafeteria.service.ts). */
export interface CompteCafeteria {
  id: string;
  tableOuNom: string;
  statut: StatutCompte;
  ouvertPar: string;
  ouvertLe: string;
  fermeLe: string | null;
  syncVersion: number;
  sousComptes: SousCompte[];
  ventes: VenteCafeteria[];
}

/** Forme JSON d'un MouvementStock (Decimal → string, voir Chambre), avec le
 * produit inclus. */
export interface MouvementStock {
  id: string;
  produitId: string;
  quantite: string;
  type: string;
  motif: string | null;
  createdBy: string;
  createdAt: string;
  produit: Produit;
}

export const STATUTS_RESERVATION = ["EN_ATTENTE", "CONFIRMEE", "EN_COURS", "TERMINEE", "ANNULEE"] as const;
export type StatutReservation = (typeof STATUTS_RESERVATION)[number];

export interface Client {
  id: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  /** Présents en base depuis la Phase 16 (pull /sync/pull + miroir local) —
   * jamais renseignés dans le payload `client` inline de création. */
  updatedAt: string;
  syncVersion: number;
}

/** Forme JSON d'une Facture (Decimal → string, voir Chambre). */
export interface Facture {
  id: string;
  reservationId: string;
  montantChambre: string;
  deviseChambre: Devise;
  montantTotalUSD: string;
  montantTotalCDF: string;
  modePaiement: ModePaiement;
  deviseRegleeParClient: Devise | null;
  montantRegleParClient: string | null;
  tauxChangeApplique: string | null;
  deviseMonnaieRendue: Devise | null;
  montantMonnaieRendue: string | null;
  numeroRecu: string;
  imprimeLe: string | null;
  annuleLe: string | null;
  motifAnnulation: string | null;
  createdAt: string;
}

/** Forme JSON d'une Reservation, avec chambre/client/facture inclus (voir
 * `include` de ReservationsController — findAll/findOne les incluent
 * toujours). `facture` est `null` tant que le séjour n'est pas facturé. */
export interface Reservation {
  id: string;
  chambreId: string;
  chambre: Chambre;
  clientId: string;
  client: Client;
  dateArrivee: string;
  dateDepart: string;
  acompte: string;
  statut: StatutReservation;
  origine: string;
  annuleLe: string | null;
  motifAnnulation: string | null;
  facture: Facture | null;
  syncVersion: number;
}

/** Corps de POST /public/hotels/inscription (Phase 4) — inscription en
 * libre-service, toujours statutLicence = ESSAI côté serveur. */
export interface InscriptionHotelPayload {
  nom: string;
  sousDomaine: string;
  nomProprietaire: string;
  email: string;
  motDePasse: string;
  telephoneContact?: string;
  adresse?: string;
  logoUrl?: string;
}

/** Doit rester synchronisé avec l'enum `StatutLicence` du schéma Prisma. */
export enum StatutLicence {
  ESSAI = "ESSAI",
  ACTIF = "ACTIF",
  SUSPENDU = "SUSPENDU",
  RESILIE = "RESILIE",
}

/** Réponse de POST /public/hotels/inscription — l'Hotel créé, avec sa charte
 * graphique (générique ou dérivée d'un logo, voir Phase 5). */
export interface HotelCree {
  id: string;
  nom: string;
  sousDomaine: string;
  statutLicence: StatutLicence;
  emailContact: string | null;
  telephoneContact: string | null;
  adresse: string | null;
  // Domaine personnalisé (Phase 13) — voir apps/api/src/super-admin/render-domains.service.ts.
  domainePersonnalise: string | null;
  domaineVerifie: boolean;
  createdAt: string;
  updatedAt: string;
  branding: {
    id: string;
    hotelId: string;
    logoUrl: string | null;
    policeAffichage: string;
    policeCorps: string;
    policeMono: string;
    palette: unknown;
    createdAt: string;
    updatedAt: string;
  };
}

/** Corps de POST /public/reservations (Phase 9 : sousDomaine ajouté pour la
 * résolution de tenant — voir DECISIONS.md). */
export interface DemandeReservationPayload {
  sousDomaine: string;
  chambreId: string;
  client: {
    nom: string;
    telephone?: string;
    email?: string;
  };
  dateArrivee: string;
  dateDepart: string;
}

/** Réponse de GET /public/hotel — charte graphique publique d'un hôtel
 * (Phase 11), volontairement minimale (ni statutLicence, ni emailContact,
 * etc., qui n'ont rien à faire côté public). */
export interface InfoHotelPublique extends ContenuSiteHotel {
  nom: string;
  logoUrl: string | null;
  policeAffichage: string;
  policeCorps: string;
  policeMono: string;
  palette: unknown;
  adresse: string | null;
  telephoneContact: string | null;
  emailContact: string | null;
}

/** Icônes de service proposées au patron — synchronisé avec
 * `ICONES_SERVICE` de apps/api/src/hotel-site/dto/modifier-site.dto.ts. */
export const ICONES_SERVICE = [
  "restaurant",
  "piscine",
  "wifi",
  "parking",
  "navette",
  "climatisation",
  "salle-conference",
  "bar",
  "spa",
  "securite",
  "blanchisserie",
  "petit-dejeuner",
  "autre",
] as const;
export type IconeService = (typeof ICONES_SERVICE)[number];

export const LIBELLE_ICONE_SERVICE: Record<IconeService, string> = {
  restaurant: "Restaurant",
  piscine: "Piscine",
  wifi: "Wi-Fi",
  parking: "Parking",
  navette: "Navette",
  climatisation: "Climatisation",
  "salle-conference": "Salle de conférence",
  bar: "Bar",
  spa: "Spa",
  securite: "Sécurité 24 h/24",
  blanchisserie: "Blanchisserie",
  "petit-dejeuner": "Petit-déjeuner",
  autre: "Autre",
};

export interface ServiceHotel {
  icone: IconeService;
  titre: string;
  description?: string;
}

/** Réseaux sociaux connus (clés de `ContenuSiteHotel.reseaux`). */
export const RESEAUX_SOCIAUX = ["facebook", "instagram", "tiktok", "youtube", "x"] as const;
export type ReseauSocial = (typeof RESEAUX_SOCIAUX)[number];

/** Contenu éditorial du site public d'un hôtel (modèle HotelSite). */
export interface ContenuSiteHotel {
  slogan: string | null;
  presentation: string | null;
  couvertureUrl: string | null;
  galerie: string[];
  services: ServiceHotel[];
  whatsapp: string | null;
  horaireArrivee: string | null;
  horaireDepart: string | null;
  reception24h: boolean;
  lienCarte: string | null;
  reseaux: Partial<Record<ReseauSocial, string>>;
}

/** GET /hotel-site (PATRON) : coordonnées + contenu du site, à plat. */
export interface SiteHotelEditable extends ContenuSiteHotel {
  nom: string;
  /** Lecture seule (défini à l'inscription). */
  sousDomaine: string;
  adresse: string | null;
  telephoneContact: string | null;
  emailContact: string | null;
}

export type UsageImage = "chambre" | "couverture" | "galerie";

/** Nombre maximal de photos par chambre (imposé aussi par l'API). */
export const MAX_PHOTOS_CHAMBRE = 2;
export const MAX_PHOTOS_GALERIE = 6;

/** GET /public/hotels-partenaires — hôtels ACTIF affichés sur la page d'accueil. */
export interface HotelPartenairePublic {
  nom: string;
  sousDomaine: string;
  logoUrl: string | null;
  adresse: string | null;
  couleur: string | null;
}

/** Doit rester synchronisé avec l'enum `MethodePaiementLicence` du schéma
 * Prisma (Phase 12, suivi manuel des paiements). */
export enum MethodePaiementLicence {
  VIREMENT = "VIREMENT",
  MOBILE_MONEY = "MOBILE_MONEY",
  ESPECES = "ESPECES",
  AUTRE = "AUTRE",
}

/** `HotelCree` + `valideJusquau` (Phase 12) — calculé côté serveur, jamais
 * stocké (voir apps/api/src/super-admin/calculer-validite.ts). Réponse de
 * GET /super-admin/hotels uniquement ; `HotelCree` seul reste la réponse des
 * endpoints d'onboarding/inscription, qui n'ont pas cette notion. */
export interface HotelAvecValidite extends HotelCree {
  valideJusquau: string;
}
