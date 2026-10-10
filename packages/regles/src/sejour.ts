import type { DeviseRegle } from "./encaissement";

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
  const montantChambre = e.prixParNuit * nuits;
  const montantDuChambre = Math.max(0, montantChambre - e.acompte);
  const cafeteriaUSD = e.consommations.reduce((s, v) => s + v.montantTotalUSD, 0);
  const cafeteriaCDF = e.consommations.reduce((s, v) => s + v.montantTotalCDF, 0);
  const montantTotalUSD = (e.deviseChambre === "USD" ? montantDuChambre : 0) + cafeteriaUSD;
  const montantTotalCDF = (e.deviseChambre === "CDF" ? montantDuChambre : 0) + cafeteriaCDF;
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
