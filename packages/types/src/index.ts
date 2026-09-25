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
