/**
 * Onglet « Séjours » (11/11/2026) : règles PURES partagées entre le téléphone et le bureau — ce qu'il y a à faire aujourd'hui (arrivées, départs,
 * clients présents), LA bonne action à proposer sur chaque séjour, disponibilité des chambres sur des dates, acompte rapide. Aucune dépendance à l'écran.
 * Le jour est celui de Lubumbashi (UTC+2, sans heure d'été), comme partout dans l'application.
 */

const DECALAGE_MS = 2 * 3_600_000;
const JOUR_MS = 86_400_000;
const t = (d: string | Date) => (d instanceof Date ? d.getTime() : Date.parse(d));

export interface SejourPourJour {
  id: string;
  chambreId: string;
  statut: string;
  dateArrivee: string | Date;
  dateDepart: string | Date;
}

/** [début, fin[ du jour de `maintenant` à Lubumbashi, en millisecondes. */
export function bornesDuJour(maintenant: Date = new Date()): { debut: number; fin: number } {
  const debut = Math.floor((maintenant.getTime() + DECALAGE_MS) / JOUR_MS) * JOUR_MS - DECALAGE_MS;
  return { debut, fin: debut + JOUR_MS };
}

export interface SejoursDuJour<S extends SejourPourJour = SejourPourJour> {
  /** Clients attendus (confirmés ou en attente) qui arrivent aujourd'hui, ou qui auraient dû arriver et dont le séjour court encore. */
  arrivees: S[];
  /** Clients dans la chambre qui doivent partir aujourd'hui (ou dont le départ est dépassé) : reste à facturer. */
  departs: S[];
  /** Clients dans la chambre qui restent (départ après aujourd'hui). */
  presents: S[];
}

export function sejoursDuJour<S extends SejourPourJour>(reservations: readonly S[], maintenant: Date = new Date()): SejoursDuJour<S> {
  const { debut, fin } = bornesDuJour(maintenant);
  const arrivees: S[] = [];
  const departs: S[] = [];
  const presents: S[] = [];
  for (const r of reservations) {
    if (r.statut === "CONFIRMEE" || r.statut === "EN_ATTENTE") {
      if (t(r.dateArrivee) < fin && t(r.dateDepart) > debut) arrivees.push(r);
    } else if (r.statut === "EN_COURS") {
      if (t(r.dateDepart) < fin) departs.push(r);
      else presents.push(r);
    }
  }
  const parArrivee = (a: S, b: S) => t(a.dateArrivee) - t(b.dateArrivee);
  const parDepart = (a: S, b: S) => t(a.dateDepart) - t(b.dateDepart);
  return { arrivees: arrivees.sort(parArrivee), departs: departs.sort(parDepart), presents: presents.sort(parDepart) };
}

export type ActionSejour = "confirmer" | "checkin" | "facturer";

export interface ProposeActionSejour {
  id: ActionSejour;
  libelle: string;
}

/**
 * LA bonne action d'un séjour du jour : confirmer une demande (sauf si sa chambre est déjà prise), check-in d'une réservation confirmée, facturer et
 * départ d'un client qui part. Gestes de réception : retirés au patron qui ne peut pas opérer. Un client simplement présent n'a pas d'action.
 */
export function actionPourSejour(
  sejour: Pick<SejourPourJour, "statut">,
  options: { operer: boolean; chambrePrise?: boolean; departAujourdhui?: boolean }
): ProposeActionSejour | null {
  if (!options.operer) return null;
  switch (sejour.statut) {
    case "EN_ATTENTE":
      return options.chambrePrise ? null : { id: "confirmer", libelle: "Confirmer la réservation" };
    case "CONFIRMEE":
      return { id: "checkin", libelle: "Check-in" };
    case "EN_COURS":
      return options.departAujourdhui ? { id: "facturer", libelle: "Facturer et départ" } : null;
    default:
      return null;
  }
}

export type MotifIndisponible = "reservee" | "occupee";

/**
 * Pour chaque chambre : pourquoi elle n'est pas disponible entre deux dates (réservée par un client confirmé, ou occupée par un client présent).
 * Même règle que le serveur (CONFIRMEE et EN_COURS qui chevauchent) ; une chambre absente du résultat est libre sur ces dates.
 */
export function chambresIndisponibles(reservations: readonly SejourPourJour[], arrivee: string | Date, depart: string | Date): Map<string, MotifIndisponible> {
  const resultat = new Map<string, MotifIndisponible>();
  const a = t(arrivee);
  const d = t(depart);
  for (const r of reservations) {
    if (r.statut !== "CONFIRMEE" && r.statut !== "EN_COURS") continue;
    if (!(t(r.dateArrivee) < d && t(r.dateDepart) > a)) continue;
    if (r.statut === "EN_COURS") resultat.set(r.chambreId, "occupee");
    else if (!resultat.has(r.chambreId)) resultat.set(r.chambreId, "reservee");
  }
  return resultat;
}

export type ChoixAcompte = "aucun" | "moitie" | "tout";

/** Montant de l'acompte rapide : 0, la moitié du séjour (arrondie au centime) ou tout. */
export function montantAcompteRapide(total: number, choix: ChoixAcompte): number {
  if (!(total > 0) || choix === "aucun") return 0;
  if (choix === "tout") return Math.round(total * 100) / 100;
  return Math.round((total / 2) * 100) / 100;
}

/** Quel bouton rapide correspond au montant saisi (null = montant libre). */
export function choixAcompteDe(total: number, acompte: number): ChoixAcompte | null {
  if (!Number.isFinite(acompte)) return null;
  if (acompte === 0) return "aucun";
  if (Math.abs(acompte - montantAcompteRapide(total, "moitie")) < 0.005) return "moitie";
  if (Math.abs(acompte - montantAcompteRapide(total, "tout")) < 0.005) return "tout";
  return null;
}
