/**
 * Dates de l'hôtel : le jour de la réception suit Africa/Lubumbashi (UTC+2 toute l'année, pas d'heure d'été), quel que soit
 * le fuseau ou l'horloge réglés sur le téléphone (un téléphone resté sur un autre fuseau voyait « aujourd'hui » décalé,
 * donc de mauvaises arrivées/départs). Même règle que `jourCompact` de @hotel-chicago/regles (décalage de 2 h).
 *
 * Méthode : on décale l'instant de +2 h puis on lit les champs UTC — jamais les getters locaux (getDate, getHours…).
 */
const DECALAGE_MS = 2 * 3_600_000;
export const MS_PAR_JOUR = 86_400_000;

/** Instant décalé à lire avec les getters UTC (= l'heure murale à Lubumbashi). */
function murale(d: Date): Date {
  return new Date(d.getTime() + DECALAGE_MS);
}

function deux(n: number): string {
  return String(n).padStart(2, "0");
}

/** Jour en cours à Lubumbashi, « AAAA-MM-JJ ». */
export function jourLubumbashi(d: Date = new Date()): string {
  return murale(d).toISOString().slice(0, 10);
}

/** « AAAA-MM-JJ » → instant du minuit de ce jour à Lubumbashi (null si la date n'existe pas). */
export function debutDuJour(jour: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour);
  if (!m) return null;
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(a, mo - 1, j);
  const verif = new Date(t);
  if (verif.getUTCFullYear() !== a || verif.getUTCMonth() !== mo - 1 || verif.getUTCDate() !== j) return null;
  return new Date(t - DECALAGE_MS);
}

/** Minuit (début) du jour de `d` à Lubumbashi. */
export function debutJournee(d: Date = new Date()): Date {
  return debutDuJour(jourLubumbashi(d))!;
}

/** Minuit suivant : borne exclusive de la journée de `d`. */
export function finJournee(d: Date = new Date()): Date {
  return new Date(debutJournee(d).getTime() + MS_PAR_JOUR);
}

/** Ajoute des jours entiers (pas d'heure d'été : 24 h exactement). */
export function ajouterJours(d: Date, jours: number): Date {
  return new Date(d.getTime() + jours * MS_PAR_JOUR);
}

/** Les deux instants tombent-ils le même jour à Lubumbashi ? */
export function memeJour(iso: string | Date, ref: Date = new Date()): boolean {
  const t = (typeof iso === "string" ? new Date(iso) : iso).getTime();
  return t >= debutJournee(ref).getTime() && t < finJournee(ref).getTime();
}

/** Midi à Lubumbashi du jour « AAAA-MM-JJ » (convention des dates de séjour), en ISO ; null si la date n'existe pas. */
export function midiLubumbashi(jour: string): string | null {
  const debut = debutDuJour(jour);
  return debut ? new Date(debut.getTime() + 12 * 3_600_000).toISOString() : null;
}

/** Jour (« AAAA-MM-JJ ») d'un instant ISO, à Lubumbashi. */
export function jourDeIso(iso: string | Date): string {
  return jourLubumbashi(typeof iso === "string" ? new Date(iso) : iso);
}

/** « JJ/MM » */
export function dateCourte(iso: string | Date): string {
  const m = murale(typeof iso === "string" ? new Date(iso) : iso);
  return `${deux(m.getUTCDate())}/${deux(m.getUTCMonth() + 1)}`;
}

/** « JJ/MM/AAAA » */
export function dateComplete(iso: string | Date): string {
  const m = murale(typeof iso === "string" ? new Date(iso) : iso);
  return `${deux(m.getUTCDate())}/${deux(m.getUTCMonth() + 1)}/${m.getUTCFullYear()}`;
}

/** « HH:MM » */
export function heureCourte(iso: string | Date): string {
  const m = murale(typeof iso === "string" ? new Date(iso) : iso);
  return `${deux(m.getUTCHours())}:${deux(m.getUTCMinutes())}`;
}

/** Numéro du jour dans le mois (1-31) et jour de la semaine (0 = dimanche), à Lubumbashi. */
export function jourDuMois(d: Date): number {
  return murale(d).getUTCDate();
}
export function jourDeLaSemaine(d: Date): number {
  return murale(d).getUTCDay();
}

/** Mise en forme libre (Intl) sur l'heure de Lubumbashi, sans dépendre du fuseau du téléphone ni du support de `timeZone`. */
export function formaterLubumbashi(d: Date | string, options: Intl.DateTimeFormatOptions): string {
  return murale(typeof d === "string" ? new Date(d) : d).toLocaleDateString("fr-FR", { ...options, timeZone: "UTC" });
}
