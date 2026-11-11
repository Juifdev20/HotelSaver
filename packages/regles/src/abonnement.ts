/**
 * Règles d'abonnement, UNE seule version pour l'API et les applications : formules, prix, durées, échéance, état (essai, actif, délai de
 * grâce, expiré). Pure (seul un type est importé) : tout est calculable hors ligne, et la date de fin n'est JAMAIS stockée — elle se déduit du dernier
 * paiement (ou de la date de création pour l'essai).
 */

import type { EtatAbonnement } from "@hotel-chicago/types";

/** Identifiant d'une formule. Les trois premières sont celles de départ ; le super-admin peut en créer d'autres (le code est libre). */
export type CodeFormule = string;

/** Ce qu'une formule peut ouvrir. Le super-admin coche celles de chaque formule. */
export const FONCTIONS = ["RECEPTION", "CAFETERIA", "SITE_PUBLIC", "DOMAINE_PERSONNALISE", "ACOMPTE_EN_LIGNE"] as const;
export type Fonction = (typeof FONCTIONS)[number];

export const LIBELLE_FONCTION: Record<Fonction, string> = {
  RECEPTION: "Réception : chambres, réservations, clients, facturation",
  CAFETERIA: "Cafétaria : menu, stock, comptes ouverts, ventes",
  SITE_PUBLIC: "Site public de réservation à vos couleurs",
  DOMAINE_PERSONNALISE: "Domaine personnalisé (votre-hotel.com)",
  ACOMPTE_EN_LIGNE: "Acompte payé en ligne (Mobile Money et carte) sur le site",
};

export function estFonction(valeur: unknown): valeur is Fonction {
  return (FONCTIONS as readonly string[]).includes(valeur as string);
}

export interface FormuleAbonnement {
  code: CodeFormule;
  nom: string;
  /** Prix d'un mois, en dollars. Le prix en francs congolais en découle (voir `prixAbonnement`). */
  prixMensuelUsd: number;
  /** Nombre maximal de chambres ; null = illimité. */
  maxChambres: number | null;
  description: string;
  recommandee?: boolean;
  /** Fonctions ouvertes par cette formule. */
  fonctions: Fonction[];
  /** Lignes libres affichées en plus des fonctions sur la page des tarifs. */
  avantages: string[];
}

/** Les réglages modifiables par le super-admin (ParametresPlateforme). */
export interface ParametresAbonnement {
  tauxCdf: number;
  moisOffertsAnnuel: number;
  joursEssai: number;
  joursGrace: number;
  fonctionsEssai: Fonction[];
  /** Licences (11/11/2026) : frais de maintenance mensuels en dollars, délai de grâce après l'échéance et jours de rappel avant. */
  fraisMaintenanceUsd: number;
  joursGraceMaintenance: number;
  joursPreavisMaintenance: number;
}

export const PARAMETRES_PAR_DEFAUT: ParametresAbonnement = {
  tauxCdf: 2800,
  moisOffertsAnnuel: 2,
  joursEssai: 14,
  joursGrace: 3,
  fonctionsEssai: [...FONCTIONS],
  fraisMaintenanceUsd: 5,
  joursGraceMaintenance: 2,
  joursPreavisMaintenance: 5,
};

/** Formules de DÉPART (reprises par la migration) — la vérité est dans la base, éditable par le super-admin ; ceci sert de valeur de secours et aux tests. */
export const FORMULES: FormuleAbonnement[] = [
  {
    code: "ESSENTIEL",
    nom: "Essentiel",
    prixMensuelUsd: 29,
    maxChambres: 15,
    description: "Pour un petit hôtel qui démarre.",
    fonctions: ["RECEPTION"],
    avantages: ["Réception et réservations", "Facturation et reçus imprimés", "Double devise USD / CDF", "Application mobile et ordinateur"],
  },
  {
    code: "PRO",
    nom: "Pro",
    prixMensuelUsd: 59,
    maxChambres: 40,
    description: "Pour un hôtel avec cafétaria et réservations en ligne.",
    recommandee: true,
    fonctions: ["RECEPTION", "CAFETERIA", "SITE_PUBLIC", "ACOMPTE_EN_LIGNE"],
    avantages: ["Fonctionnement hors ligne et synchronisation", "Site public de réservation à vos couleurs", "Acompte payé en ligne par Mobile Money ou carte"],
  },
  {
    code: "PREMIUM",
    nom: "Premium",
    prixMensuelUsd: 99,
    maxChambres: null,
    description: "Pour les établissements qui veulent leur propre identité.",
    fonctions: ["RECEPTION", "CAFETERIA", "SITE_PUBLIC", "DOMAINE_PERSONNALISE", "ACOMPTE_EN_LIGNE"],
    avantages: ["Accompagnement à la mise en route", "Support prioritaire"],
  },
];

export function formuleParCode(code: unknown, formules: FormuleAbonnement[] = FORMULES): FormuleAbonnement | undefined {
  return formules.find((f) => f.code === code);
}

/** Les lignes affichées pour une formule : plafond, fonctions cochées, puis les avantages libres. */
export function lignesFormule(f: Pick<FormuleAbonnement, "maxChambres" | "fonctions" | "avantages">): string[] {
  return [
    f.maxChambres === null ? "Chambres illimitées" : `Jusqu'à ${f.maxChambres} chambres`,
    ...f.fonctions.map((fn) => LIBELLE_FONCTION[fn]),
    ...f.avantages,
  ];
}

/**
 * Fonctions dont un hôtel dispose : celles de sa formule payée ; pendant l'essai, celles de l'essai ; un hôtel créé à la main avec des
 * paiements mais sans formule garde TOUT (cas historique, jamais restreint par surprise). Un hôtel dont l'accès est coupé n'en a aucune.
 */
export function fonctionsAutorisees(
  hotel: { formule?: string | null },
  aPaye: boolean,
  formules: FormuleAbonnement[],
  parametres: Pick<ParametresAbonnement, "fonctionsEssai">
): Fonction[] {
  const formule = hotel.formule ? formuleParCode(hotel.formule, formules) : undefined;
  if (formule) return formule.fonctions.filter(estFonction);
  if (!aPaye) return parametres.fonctionsEssai.filter(estFonction);
  return [...FONCTIONS];
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

/** Mois réellement payés pour `mois` mois obtenus : 12 mois d'un coup = 12 − `moisOffertsAnnuel` payés (2 par défaut). */
export function moisFactures(mois: number, moisOffertsAnnuel: number = MOIS_OFFERTS[12]): number {
  const offerts = mois === 12 ? Math.min(Math.max(0, Math.floor(moisOffertsAnnuel)), 11) : 0;
  return Math.max(0, mois - offerts);
}

/**
 * Prix à payer pour `mois` mois de `formule`, dans la devise choisie.
 * USD : au cent près. CDF : converti au taux de la plateforme puis arrondi au-dessus au pas de 500 FC. 0 si la formule ou la durée est inconnue.
 */
export function prixAbonnement(p: { formule: unknown; mois: number; devise: DeviseAbonnement; tauxCdf?: number; formules?: FormuleAbonnement[]; moisOffertsAnnuel?: number }): number {
  const formule = formuleParCode(p.formule, p.formules);
  if (!formule || !(DUREES_MOIS as readonly number[]).includes(p.mois)) return 0;
  const usd = Math.round(formule.prixMensuelUsd * moisFactures(p.mois, p.moisOffertsAnnuel) * 100) / 100;
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

/** Jours d'essai d'un hôtel : les siens s'il en a (0 = numéro qui a déjà eu un essai), sinon le réglage de la plateforme. */
export function joursEssaiDe(hotel: { joursEssai?: number | null }, joursEssaiPlateforme: number = JOURS_ESSAI): number {
  return typeof hotel.joursEssai === "number" && hotel.joursEssai >= 0 ? hotel.joursEssai : joursEssaiPlateforme;
}

/** Fin de validité : le dernier paiement, ou, à défaut, la fin de l'essai (création + jours d'essai de l'hôtel). */
export function finValidite(hotel: { createdAt: Date; joursEssai?: number | null }, dernierPaiement: { periodeCouverteJusquau: Date } | null, joursEssai: number = JOURS_ESSAI): Date {
  if (dernierPaiement) return dernierPaiement.periodeCouverteJusquau;
  const fin = new Date(hotel.createdAt);
  fin.setDate(fin.getDate() + joursEssaiDe(hotel, joursEssai));
  return fin;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Licences (11/11/2026) : l'hôtel achète une licence de 1, 2 ou 3 ans hors de l'application ; le super-admin l'active à la main. Pendant sa durée
// l'hôtel a toutes les fonctions et paie seulement des frais de maintenance mensuels (30 jours), par Mobile Money comme l'abonnement.
// ---------------------------------------------------------------------------------------------------------------------------------

/** Durées de licence proposées à l'activation, en années. */
export const DUREES_LICENCE_ANNEES = [1, 2, 3] as const;
/** Une période de maintenance dure 30 jours (et non un mois du calendrier). */
export const JOURS_MAINTENANCE = 30;
/** Durées de maintenance payables d'un coup, en périodes de 30 jours (sans réduction). */
export const MOIS_MAINTENANCE = [1, 3, 6, 12] as const;

/** Ce qu'il faut savoir d'une licence ACTIVE pour juger de l'accès : ses dates, la dernière maintenance payée et les réglages. */
export interface ContexteLicence {
  annees: number;
  debutLe: Date;
  finLe: Date;
  /** Fin de la dernière période de maintenance payée (non annulée) ; null = aucune : le premier mois est compris dans la licence. */
  derniereMaintenanceJusquau: Date | null;
  fraisMaintenanceUsd: number;
  joursGraceMaintenance: number;
  joursPreavisMaintenance: number;
}

const ajouterJours = (date: Date, jours: number) => new Date(date.getTime() + jours * JOUR_MS);

/** Échéance de la maintenance : le dernier paiement, ou le début de la licence + 30 jours (premier mois compris). */
export function finMaintenance(licence: Pick<ContexteLicence, "debutLe" | "derniereMaintenanceJusquau">): Date {
  return licence.derniereMaintenanceJusquau ?? ajouterJours(licence.debutLe, JOURS_MAINTENANCE);
}

/** Nouvelle échéance après un paiement de `mois` périodes de 30 jours : on repart de l'échéance si elle est à venir (payer d'avance ne fait perdre aucun jour), sinon de maintenant. */
export function nouvelleFinMaintenance(finActuelle: Date, maintenant: Date, mois: number): Date {
  const base = finActuelle.getTime() > maintenant.getTime() ? finActuelle : maintenant;
  return ajouterJours(base, JOURS_MAINTENANCE * mois);
}

/** Frais de maintenance de `mois` périodes : dollars au cent près ; francs au taux de la plateforme, arrondis au-dessus à 500 FC. 0 si la durée est inconnue. */
export function prixMaintenance(p: { fraisUsd: number; mois: number; devise: DeviseAbonnement; tauxCdf?: number }): number {
  if (!(MOIS_MAINTENANCE as readonly number[]).includes(p.mois) || !(p.fraisUsd > 0)) return 0;
  const usd = Math.round(p.fraisUsd * p.mois * 100) / 100;
  if (p.devise === "USD") return usd;
  const taux = p.tauxCdf && p.tauxCdf > 0 ? p.tauxCdf : TAUX_CDF_ABONNEMENT_DEFAUT;
  return Math.ceil((usd * taux) / PAS_ARRONDI_CDF) * PAS_ARRONDI_CDF;
}

/** Fin d'une licence qui commence à `debut` et dure `annees` années (années du calendrier). */
export function finLicence(debut: Date, annees: number): Date {
  return ajouterMois(debut, 12 * annees);
}

/** Début d'une nouvelle licence : maintenant, ou la fin de la licence en cours si elle court encore (acheter d'avance ne fait perdre aucun jour). */
export function debutNouvelleLicence(finLicenceEnCours: Date | null, maintenant: Date): Date {
  return finLicenceEnCours && finLicenceEnCours.getTime() > maintenant.getTime() ? finLicenceEnCours : maintenant;
}

/** Réglages de la protection contre les essais abusifs (18/10/2026), modifiables par le super-admin. */
export interface ParametresProtectionEssai {
  joursAvantSuppression: number;
  maxChambresEssai: number;
  maxProduitsEssai: number;
  maxPhotosGalerieEssai: number;
  maxInscriptionsParJour: number;
}

export const PROTECTION_ESSAI_PAR_DEFAUT: ParametresProtectionEssai = {
  joursAvantSuppression: 10,
  maxChambresEssai: 10,
  maxProduitsEssai: 50,
  maxPhotosGalerieEssai: 6,
  maxInscriptionsParJour: 2,
};

/** Messages des plafonds de l'essai — les MÊMES côté serveur et hors ligne (packages/miroir-local, voir AGENTS.md). */
export const messagePlafondEssai = {
  chambres: (n: number) => `L'essai gratuit est limité à ${n} chambres. Choisissez une formule dans Paramètres → Abonnement pour en ajouter.`,
  produits: (n: number) => `L'essai gratuit est limité à ${n} produits. Choisissez une formule dans Paramètres → Abonnement pour en ajouter.`,
  photosGalerie: (n: number) => `L'essai gratuit est limité à ${n} photos dans la galerie. Choisissez une formule dans Paramètres → Abonnement pour en ajouter.`,
};

export function etatAbonnement(
  hotel: { createdAt: Date; statutLicence: string; suspensionManuelle?: boolean; joursEssai?: number | null },
  dernierPaiement: { periodeCouverteJusquau: Date } | null,
  maintenant: Date,
  parametres: Partial<Pick<ParametresAbonnement, "joursEssai" | "joursGrace"> & ParametresProtectionEssai> = {},
  /** Licence EN COURS de l'hôtel (début ≤ maintenant < fin, non annulée), s'il en a une : l'accès dépend alors des frais de maintenance. */
  licence: ContexteLicence | null = null
): EtatAbonnement {
  if (licence && maintenant.getTime() >= licence.debutLe.getTime() && maintenant.getTime() <= licence.finLe.getTime()) {
    return etatLicence(hotel, licence, maintenant);
  }
  const fin = finValidite(hotel, dernierPaiement, parametres.joursEssai);
  // Sans essai (numéro déjà utilisé), pas de délai de grâce non plus : sinon trois jours gratuits quand même.
  const sansEssai = !dernierPaiement && joursEssaiDe(hotel, parametres.joursEssai) === 0;
  const grace = new Date(fin.getTime() + (sansEssai ? 0 : (parametres.joursGrace ?? JOURS_GRACE_ABONNEMENT)) * JOUR_MS);
  const jamaisPaye = !dernierPaiement && hotel.statutLicence !== "ACTIF";
  const base = {
    valideJusquau: fin.toISOString(),
    graceJusquau: grace.toISOString(),
    joursRestants: Math.ceil((fin.getTime() - maintenant.getTime()) / JOUR_MS),
    suppressionLe:
      jamaisPaye && typeof parametres.joursAvantSuppression === "number" ? new Date(grace.getTime() + parametres.joursAvantSuppression * JOUR_MS).toISOString() : null,
    plafondsEssai:
      jamaisPaye && typeof parametres.maxChambresEssai === "number"
        ? { chambres: parametres.maxChambresEssai, produits: parametres.maxProduitsEssai ?? PROTECTION_ESSAI_PAR_DEFAUT.maxProduitsEssai, photosGalerie: parametres.maxPhotosGalerieEssai ?? PROTECTION_ESSAI_PAR_DEFAUT.maxPhotosGalerieEssai }
        : null,
  };

  if (hotel.statutLicence === "RESILIE") return { ...base, statut: "RESILIE", bloque: true, renouvelable: false, alerte: "RESILIE" };
  // Suspendu à la main — ou suspendu alors que l'échéance n'est pas passée (ne peut venir que d'une main : le cron ne suspend que les échus).
  if (hotel.statutLicence === "SUSPENDU" && (hotel.suspensionManuelle || maintenant.getTime() <= fin.getTime())) return { ...base, statut: "SUSPENDU", bloque: true, renouvelable: false, alerte: "SUSPENDU" };

  if (maintenant.getTime() <= fin.getTime()) {
    return { ...base, statut: dernierPaiement ? "ACTIF" : "ESSAI", bloque: false, renouvelable: true, alerte: base.joursRestants <= JOURS_PREAVIS_ABONNEMENT ? "BIENTOT" : null };
  }
  if (maintenant.getTime() <= grace.getTime()) return { ...base, statut: "EN_GRACE", bloque: false, renouvelable: true, alerte: "GRACE" };
  return { ...base, statut: "EXPIRE", bloque: true, renouvelable: true, alerte: "EXPIRE" };
}

/**
 * État d'un hôtel qui a une licence en cours. `valideJusquau` est l'échéance de la MAINTENANCE (c'est elle qui décide de l'accès), ce qui
 * fait fonctionner tel quel les bandeaux, la garde d'accès et la suspension automatique ; les dates et frais de la licence sont dans `licence`.
 */
function etatLicence(hotel: { statutLicence: string; suspensionManuelle?: boolean }, licence: ContexteLicence, maintenant: Date): EtatAbonnement {
  const fin = finMaintenance(licence);
  const grace = ajouterJours(fin, licence.joursGraceMaintenance);
  const joursRestants = Math.ceil((fin.getTime() - maintenant.getTime()) / JOUR_MS);
  const base = {
    valideJusquau: fin.toISOString(),
    graceJusquau: grace.toISOString(),
    joursRestants,
    suppressionLe: null,
    plafondsEssai: null,
    licence: {
      annees: licence.annees,
      debutLe: licence.debutLe.toISOString(),
      finLe: licence.finLe.toISOString(),
      joursRestantsLicence: Math.ceil((licence.finLe.getTime() - maintenant.getTime()) / JOUR_MS),
      fraisMaintenanceUsd: licence.fraisMaintenanceUsd,
      preavisJours: licence.joursPreavisMaintenance,
    },
  };
  if (hotel.statutLicence === "RESILIE") return { ...base, statut: "RESILIE", bloque: true, renouvelable: false, alerte: "RESILIE" };
  // Suspendu à la main (le cron ne suspend que les échus, jamais avant l'échéance de la maintenance).
  if (hotel.statutLicence === "SUSPENDU" && (hotel.suspensionManuelle || maintenant.getTime() <= fin.getTime())) return { ...base, statut: "SUSPENDU", bloque: true, renouvelable: false, alerte: "SUSPENDU" };
  if (maintenant.getTime() <= fin.getTime()) {
    return { ...base, statut: "ACTIF", bloque: false, renouvelable: true, alerte: joursRestants <= licence.joursPreavisMaintenance ? "BIENTOT" : null };
  }
  if (maintenant.getTime() <= grace.getTime()) return { ...base, statut: "EN_GRACE", bloque: false, renouvelable: true, alerte: "GRACE" };
  return { ...base, statut: "EXPIRE", bloque: true, renouvelable: true, alerte: "EXPIRE" };
}
