/**
 * Règles d'abonnement, UNE seule version pour l'API et les applications : formules, prix, durées, échéance, état (essai, actif, délai de
 * grâce, expiré). Pure (seul un type est importé) : tout est calculable hors ligne, et la date de fin n'est JAMAIS stockée — elle se déduit du dernier
 * paiement (ou de la date de création pour l'essai).
 */

import type { EtatAbonnement } from "@hotel-chicago/types";

export type CodeFormule = "ESSENTIEL" | "PRO" | "PREMIUM";

export interface FormuleAbonnement {
  code: CodeFormule;
  nom: string;
  /** Prix d'un mois, en dollars. Le prix en francs congolais en découle (voir `prixAbonnement`). */
  prixMensuelUsd: number;
  /** Nombre maximal de chambres ; null = illimité. */
  maxChambres: number | null;
  description: string;
  recommandee?: boolean;
  inclus: string[];
}

// À VALIDER PAR LE PATRON : prix et périmètres indicatifs (repris de la page d'accueil, qui lit désormais cette liste).
export const FORMULES: FormuleAbonnement[] = [
  {
    code: "ESSENTIEL",
    nom: "Essentiel",
    prixMensuelUsd: 29,
    maxChambres: 15,
    description: "Pour un petit hôtel qui démarre.",
    inclus: ["Jusqu'à 15 chambres", "Réception et réservations", "Facturation et reçus imprimés", "Double devise USD / CDF", "Application mobile et ordinateur"],
  },
  {
    code: "PRO",
    nom: "Pro",
    prixMensuelUsd: 59,
    maxChambres: 40,
    description: "Pour un hôtel avec cafétaria et réservations en ligne.",
    recommandee: true,
    inclus: ["Jusqu'à 40 chambres", "Tout Essentiel", "Cafétaria, stock et comptes ouverts", "Site public de réservation à vos couleurs", "Fonctionnement hors ligne et synchronisation"],
  },
  {
    code: "PREMIUM",
    nom: "Premium",
    prixMensuelUsd: 99,
    maxChambres: null,
    description: "Pour les établissements qui veulent leur propre identité.",
    inclus: ["Chambres illimitées", "Tout Pro", "Domaine personnalisé (votre-hotel.com)", "Accompagnement à la mise en route", "Support prioritaire"],
  },
];

export function formuleParCode(code: unknown): FormuleAbonnement | undefined {
  return FORMULES.find((f) => f.code === code);
}

/** Durées proposées à l'achat, en mois. */
export const DUREES_MOIS = [1, 3, 6, 12] as const;
/** Mois offerts selon la durée payée d'un coup (12 mois achetés = 10 payés). */
export const MOIS_OFFERTS: Record<number, number> = { 12: 2 };

export const JOURS_ESSAI = 14;
/** Après l'échéance, l'hôtel continue de travailler (avec une alerte rouge) pendant ce délai, le temps de payer. */
export const JOURS_GRACE_ABONNEMENT = 3;
/** Rappels « votre abonnement se termine » à partir de ce nombre de jours avant l'échéance. */
export const JOURS_PREAVIS_ABONNEMENT = 7;

/** Taux de conversion appliqué aux abonnements payés en francs congolais (modifiable côté serveur : variable ABONNEMENT_TAUX_CDF). */
export const TAUX_CDF_ABONNEMENT_DEFAUT = 2800;
/** Les prix en francs sont arrondis AU-DESSUS à ce pas (jamais de prix du genre 81 247 FC). */
export const PAS_ARRONDI_CDF = 500;

const JOUR_MS = 86_400_000;

export type DeviseAbonnement = "USD" | "CDF";

export function moisFactures(mois: number): number {
  return Math.max(0, mois - (MOIS_OFFERTS[mois] ?? 0));
}

/**
 * Prix à payer pour `mois` mois de `formule`, dans la devise choisie.
 * USD : au cent près. CDF : converti au taux de la plateforme puis arrondi au-dessus au pas de 500 FC. 0 si la formule ou la durée est inconnue.
 */
export function prixAbonnement(p: { formule: unknown; mois: number; devise: DeviseAbonnement; tauxCdf?: number }): number {
  const formule = formuleParCode(p.formule);
  if (!formule || !(DUREES_MOIS as readonly number[]).includes(p.mois)) return 0;
  const usd = Math.round(formule.prixMensuelUsd * moisFactures(p.mois) * 100) / 100;
  if (p.devise === "USD") return usd;
  const taux = p.tauxCdf && p.tauxCdf > 0 ? p.tauxCdf : TAUX_CDF_ABONNEMENT_DEFAUT;
  return Math.ceil((usd * taux) / PAS_ARRONDI_CDF) * PAS_ARRONDI_CDF;
}

/** Ajoute des mois civils (31 janvier + 1 mois = 28/29 février, pas 3 mars). */
export function ajouterMois(date: Date, mois: number): Date {
  const d = new Date(date.getTime());
  const jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + mois);
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernier));
  return d;
}

/** Nouvelle échéance après un achat : on repart de la fin actuelle si elle est encore à venir (payer d'avance ne fait perdre aucun jour), sinon de maintenant. */
export function nouvelleFinValidite(finActuelle: Date, maintenant: Date, mois: number): Date {
  const base = finActuelle.getTime() > maintenant.getTime() ? finActuelle : maintenant;
  return ajouterMois(base, mois);
}

/** Fin de validité : le dernier paiement, ou, à défaut, la fin de l'essai (création + 14 jours). */
export function finValidite(hotel: { createdAt: Date }, dernierPaiement: { periodeCouverteJusquau: Date } | null): Date {
  if (dernierPaiement) return dernierPaiement.periodeCouverteJusquau;
  const fin = new Date(hotel.createdAt);
  fin.setDate(fin.getDate() + JOURS_ESSAI);
  return fin;
}

export function etatAbonnement(
  hotel: { createdAt: Date; statutLicence: string; suspensionManuelle?: boolean },
  dernierPaiement: { periodeCouverteJusquau: Date } | null,
  maintenant: Date
): EtatAbonnement {
  const fin = finValidite(hotel, dernierPaiement);
  const grace = new Date(fin.getTime() + JOURS_GRACE_ABONNEMENT * JOUR_MS);
  const base = { valideJusquau: fin.toISOString(), graceJusquau: grace.toISOString(), joursRestants: Math.ceil((fin.getTime() - maintenant.getTime()) / JOUR_MS) };

  if (hotel.statutLicence === "RESILIE") return { ...base, statut: "RESILIE", bloque: true, renouvelable: false, alerte: "RESILIE" };
  if (hotel.statutLicence === "SUSPENDU" && hotel.suspensionManuelle) return { ...base, statut: "SUSPENDU", bloque: true, renouvelable: false, alerte: "SUSPENDU" };

  if (maintenant.getTime() <= fin.getTime()) {
    return { ...base, statut: dernierPaiement ? "ACTIF" : "ESSAI", bloque: false, renouvelable: true, alerte: base.joursRestants <= JOURS_PREAVIS_ABONNEMENT ? "BIENTOT" : null };
  }
  if (maintenant.getTime() <= grace.getTime()) return { ...base, statut: "EN_GRACE", bloque: false, renouvelable: true, alerte: "GRACE" };
  return { ...base, statut: "EXPIRE", bloque: true, renouvelable: true, alerte: "EXPIRE" };
}
