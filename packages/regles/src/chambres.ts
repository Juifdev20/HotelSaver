/**
 * Tableau des chambres (11/11/2026) : règles PURES partagées entre le téléphone et le bureau — qui occupe la chambre, qui doit arriver, quelle est
 * LA bonne action à proposer selon son état, comptes par statut et par type. Aucune dépendance à l'écran.
 */

export type StatutChambreLu = "LIBRE" | "OCCUPEE" | "RESERVEE" | "NETTOYAGE";

export interface ChambreLue {
  id: string;
  numero: string;
  type: string;
  statut: StatutChambreLu | string;
}

export interface SejourLu {
  id: string;
  chambreId: string;
  statut: string;
  dateArrivee: string;
  dateDepart: string;
  client: { nom: string };
}

/** Ce qu'on sait d'une chambre : le séjour en cours (client dans la chambre) et le prochain séjour confirmé. */
export interface SejoursDeLaChambre<S extends SejourLu = SejourLu> {
  enCours?: S;
  prochaine?: S;
}

/** Séjour en cours + prochain séjour CONFIRMÉ (une simple demande en attente ne réserve pas la chambre) pour chaque chambre. */
export function sejoursParChambre<S extends SejourLu>(reservations: S[], maintenant: Date = new Date()): Map<string, SejoursDeLaChambre<S>> {
  const resultat = new Map<string, SejoursDeLaChambre<S>>();
  const instant = maintenant.getTime();
  for (const r of reservations) {
    const entree = resultat.get(r.chambreId) ?? {};
    if (r.statut === "EN_COURS") {
      if (!entree.enCours || r.dateArrivee > entree.enCours.dateArrivee) entree.enCours = r;
    } else if (r.statut === "CONFIRMEE" && new Date(r.dateDepart).getTime() > instant) {
      if (!entree.prochaine || r.dateArrivee < entree.prochaine.dateArrivee) entree.prochaine = r;
    }
    resultat.set(r.chambreId, entree);
  }
  return resultat;
}

export type ActionChambre = "arrivee" | "depart" | "voir" | "propre";

export interface ProposeAction {
  id: ActionChambre;
  libelle: string;
  /** Libellé court pour les cartes étroites du téléphone. */
  libelleCourt: string;
}

/**
 * LA bonne action selon l'état de la chambre. Arrivée, départ et « marquer propre » sont des gestes de réception : retirés au patron qui ne peut pas
 * opérer (`operer` faux). « Voir le séjour » est une simple consultation, toujours permise. Aucune action quand elle n'a pas de sens (chambre occupée
 * sans séjour connu, réservée sans séjour confirmé) : le menu ⋮ reste là pour corriger à la main.
 */
export function actionPourChambre(chambre: Pick<ChambreLue, "statut">, sejours: SejoursDeLaChambre | undefined, operer: boolean): ProposeAction | null {
  switch (chambre.statut) {
    case "LIBRE":
      return operer ? { id: "arrivee", libelle: "Enregistrer une arrivée", libelleCourt: "Arrivée" } : null;
    case "OCCUPEE":
      return operer && sejours?.enCours ? { id: "depart", libelle: "Facturer et départ", libelleCourt: "Départ" } : null;
    case "RESERVEE":
      return sejours?.prochaine ? { id: "voir", libelle: "Voir le séjour", libelleCourt: "Voir" } : null;
    case "NETTOYAGE":
      return operer ? { id: "propre", libelle: "Marquer propre", libelleCourt: "Propre" } : null;
    default:
      return null;
  }
}

/** Nombre de chambres par statut (clés : LIBRE, OCCUPEE, RESERVEE, NETTOYAGE) et total. */
export function compterParStatut(chambres: Pick<ChambreLue, "statut">[]): Record<string, number> & { TOUTES: number } {
  const c: Record<string, number> & { TOUTES: number } = { TOUTES: chambres.length, LIBRE: 0, OCCUPEE: 0, RESERVEE: 0, NETTOYAGE: 0 };
  for (const ch of chambres) c[ch.statut] = (c[ch.statut] ?? 0) + 1;
  return c;
}

/** Types de chambre présents avec leur nombre (Simple · 3), triés par nom. */
export function typesDeChambres(chambres: Pick<ChambreLue, "type">[]): { type: string; nombre: number }[] {
  const m = new Map<string, number>();
  for (const c of chambres) {
    const t = c.type.trim();
    if (t) m.set(t, (m.get(t) ?? 0) + 1);
  }
  return [...m.entries()].map(([type, nombre]) => ({ type, nombre })).sort((a, b) => a.type.localeCompare(b.type, "fr"));
}

/** Ordre naturel des numéros : 2 avant 10, 101 avant 201, « 12B » après « 12 ». */
export function comparerNumeros(a: string, b: string): number {
  return a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" });
}
