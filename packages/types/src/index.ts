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
