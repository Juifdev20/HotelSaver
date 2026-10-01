import { BadRequestException } from "@nestjs/common";

/** Lubumbashi est à UTC+2 toute l'année (pas d'heure d'été). */
export const DECALAGE_HEURES = 2;
const DECALAGE_MS = DECALAGE_HEURES * 3600_000;
const MOIS_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface BornesMois {
  /** Premier instant du mois à Lubumbashi, en UTC. */
  debut: Date;
  /** Premier instant du mois suivant — bornes toujours [debut, fin[. */
  fin: Date;
  /** « 2026-09 » */
  periode: string;
  /** « septembre 2026 » — titre lisible du rapport. */
  libelle: string;
  /** « du 01/09/2026 au 30/09/2026 » */
  plage: string;
  /** true si la fin du mois est dans le futur → rapport provisoire. */
  enCours: boolean;
}

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/**
 * Bornes [debut, fin[ d'un mois « AAAA-MM » **à Lubumbashi**, en instants UTC.
 * Toute agrégation mensuelle (rapports, tableau de bord du mois) passe par
 * cette fonction : un seul fuseau, un seul calcul — le rapport et le tableau
 * de bord parlent de la même chose.
 */
export function bornesDuMois(periode: string, maintenant = new Date()): BornesMois {
  if (!MOIS_PATTERN.test(periode)) {
    throw new BadRequestException("Le mois doit être au format AAAA-MM (ex. 2026-09).");
  }
  const annee = Number(periode.slice(0, 4));
  const mois = Number(periode.slice(5, 7));
  // Minuit local du 1er = 22:00 UTC du dernier jour du mois précédent.
  const debut = new Date(Date.UTC(annee, mois - 1, 1) - DECALAGE_MS);
  const fin = new Date(Date.UTC(annee, mois, 1) - DECALAGE_MS);

  const jour = (d: Date) =>
    new Date(d.getTime() + DECALAGE_MS).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const dernierJour = new Date(fin.getTime() - 1);

  return {
    debut,
    fin,
    periode,
    libelle: `${MOIS_FR[mois - 1]} ${annee}`,
    plage: `du ${jour(debut)} au ${jour(dernierJour)}`,
    enCours: fin.getTime() > maintenant.getTime(),
  };
}

/** Libellé court de période pour le titre (« septembre 2026 »). */
export function libelleMois(periode: string): string {
  return bornesDuMois(periode).libelle;
}
