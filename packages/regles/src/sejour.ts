import { arrondir, type DeviseRegle } from "./encaissement";

const JOUR_MS = 24 * 60 * 60 * 1000;

/** Nuitées facturées : au moins une, arrondies au jour le plus proche (même règle que la facturation côté serveur). */
export function nuitees(dateArrivee: Date | string, dateDepart: Date | string): number {
  const ms = new Date(dateDepart).getTime() - new Date(dateArrivee).getTime();
  return Math.max(1, Math.round(ms / JOUR_MS));
}

export interface EntreeFactureSejour {
  prixParNuit: number;
  deviseChambre: DeviseRegle;
  dateArrivee: Date | string;
  dateDepart: Date | string;
  acompte: number;
  /** Ventes cafétaria non annulées facturées sur la chambre. */
  consommations: { montantTotalUSD: number; montantTotalCDF: number }[];
}

export interface TotauxFactureSejour {
  nuits: number;
  montantChambre: number;
  deviseChambre: DeviseRegle;
  /** Ce qu'il reste à payer pour la chambre (après acompte), dans la devise de la chambre. */
  montantDuChambre: number;
  montantTotalUSD: number;
  montantTotalCDF: number;
  /** Devise du dû : USD dès qu'il y a du dû en USD, sinon CDF (un total mixte n'est pas converti). */
  deviseDue: DeviseRegle;
  montantDu: number;
}

/** Totaux d'une facture de séjour — la même arithmétique que le serveur (FacturesService.create). */
export function totauxFactureSejour(e: EntreeFactureSejour): TotauxFactureSejour {
  const nuits = nuitees(e.dateArrivee, e.dateDepart);
  // Arrondi à la devise à chaque étape : en flottants, 0,1 + 0,2 vaut 0,30000000000000004 et ces écarts s'accumulaient dans les totaux enregistrés.
  const montantChambre = arrondir(e.prixParNuit * nuits, e.deviseChambre);
  const montantDuChambre = Math.max(0, arrondir(montantChambre - e.acompte, e.deviseChambre));
  const cafeteriaUSD = arrondir(e.consommations.reduce((s, v) => s + v.montantTotalUSD, 0), "USD");
  const cafeteriaCDF = arrondir(e.consommations.reduce((s, v) => s + v.montantTotalCDF, 0), "CDF");
  const montantTotalUSD = arrondir((e.deviseChambre === "USD" ? montantDuChambre : 0) + cafeteriaUSD, "USD");
  const montantTotalCDF = arrondir((e.deviseChambre === "CDF" ? montantDuChambre : 0) + cafeteriaCDF, "CDF");
  const deviseDue: DeviseRegle = montantTotalUSD > 0 ? "USD" : "CDF";
  return {
    nuits,
    montantChambre,
    deviseChambre: e.deviseChambre,
    montantDuChambre,
    montantTotalUSD,
    montantTotalCDF,
    deviseDue,
    montantDu: deviseDue === "USD" ? montantTotalUSD : montantTotalCDF,
  };
}

/** Deux réservations qui bloquent la chambre se chevauchent-elles ? (arrivée incluse, départ exclu) */
export function sechevauchent(a: { dateArrivee: Date | string; dateDepart: Date | string }, b: { dateArrivee: Date | string; dateDepart: Date | string }): boolean {
  return new Date(a.dateArrivee) < new Date(b.dateDepart) && new Date(a.dateDepart) > new Date(b.dateArrivee);
}

/** Statuts qui bloquent réellement une chambre (une demande EN_ATTENTE ne la bloque pas). */
export const STATUTS_OCCUPANTS = ["CONFIRMEE", "EN_COURS"] as const;

/** Plus grand acompte plausible : le prix du séjour. Au-delà, c'est une erreur de saisie — ou de l'argent détourné au moment de facturer. */
export function acompteMaximal(prixParNuit: number, dateArrivee: Date | string, dateDepart: Date | string): number {
  return Math.round(prixParNuit * nuitees(dateArrivee, dateDepart) * 100) / 100;
}

export const MESSAGE_ACOMPTE_TROP_ELEVE = "L'acompte ne peut pas dépasser le prix du séjour.";
