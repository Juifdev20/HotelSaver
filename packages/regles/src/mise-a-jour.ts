/**
 * Mises à jour de l'application (11/11/2026) : règles PURES partagées (téléphone, bureau, serveur). Les versions publiées sont les releases GitHub
 * (`vX.Y.Z`) du dépôt : c'est là que le site et les utilisateurs téléchargent déjà l'application. Aucune dépendance réseau ici.
 */

/** « v1.0.11 » → « 1.0.11 ». Toute autre forme (pré-version, texte libre) → null : on ne propose jamais une version qu'on ne sait pas comparer. */
export function versionDepuisTag(tag: string | null | undefined): string | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec((tag ?? "").trim());
  return m ? `${Number(m[1])}.${Number(m[2])}.${Number(m[3])}` : null;
}

/** Compare deux versions « X.Y.Z » segment par segment (1.0.10 > 1.0.9). Renvoie -1, 0 ou 1 ; une version illisible vaut 0.0.0. */
export function comparerVersions(a: string, b: string): -1 | 0 | 1 {
  const lire = (v: string) => (versionDepuisTag(v) ?? "0.0.0").split(".").map(Number);
  const [x, y] = [lire(a), lire(b)];
  for (let i = 0; i < 3; i++) {
    if (x[i]! < y[i]!) return -1;
    if (x[i]! > y[i]!) return 1;
  }
  return 0;
}

export interface AssetRelease {
  name: string;
  browser_download_url: string;
  size?: number;
  /** « sha256:… » (champ fourni par GitHub pour les fichiers récents). */
  digest?: string | null;
}

export interface ReleaseGithub {
  tag_name?: string | null;
  name?: string | null;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string | null;
  assets?: AssetRelease[];
}

export interface MiseAJourDisponible {
  version: string;
  /** Ce qui change, en texte simple (début de la description de la release). */
  notes: string;
  url: string;
  fichier: string;
  taille: number;
  /** Empreinte SHA-256 du fichier (hexadécimal minuscule) quand GitHub la donne, sinon null. */
  sha256: string | null;
  publieeLe: string | null;
}

/** Description de la release en texte simple : sans titres ni gras Markdown, limitée à `max` caractères. */
export function notesLisibles(corps: string | null | undefined, max = 500): string {
  const texte = (corps ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/^#{1,6}\s*/, "").replace(/\*\*|__|`/g, "").trim())
    .filter(Boolean)
    .join("\n");
  return texte.length > max ? `${texte.slice(0, max - 1).trimEnd()}…` : texte;
}

function sha256De(digest: string | null | undefined): string | null {
  const m = /^sha256:([0-9a-f]{64})$/i.exec((digest ?? "").trim());
  return m ? m[1]!.toLowerCase() : null;
}

/**
 * La mise à jour Android proposée par cette release, ou null : release brouillon / pré-version, version illisible, pas plus récente que celle
 * installée, ou aucun APK joint. On prend le fichier versionné (`HotelSaver-1.0.11.apk`), à défaut la copie au nom fixe (`HotelSaver.apk`).
 */
export function miseAJourAndroid(release: ReleaseGithub | null | undefined, versionInstallee: string): MiseAJourDisponible | null {
  if (!release || release.draft || release.prerelease) return null;
  const version = versionDepuisTag(release.tag_name);
  if (!version || comparerVersions(version, versionInstallee) <= 0) return null;
  const apks = (release.assets ?? []).filter((a) => /\.apk$/i.test(a.name) && a.browser_download_url);
  const asset = apks.find((a) => a.name.toLowerCase() === `hotelsaver-${version}.apk`) ?? apks.find((a) => a.name.toLowerCase() === "hotelsaver.apk");
  if (!asset) return null;
  return {
    version,
    notes: notesLisibles(release.body),
    url: asset.browser_download_url,
    fichier: asset.name,
    taille: asset.size ?? 0,
    sha256: sha256De(asset.digest),
    publieeLe: release.published_at ?? null,
  };
}

/** Taille lisible : « 58 Mo », « 840 Ko ». */
export function tailleLisible(octets: number): string {
  if (!(octets > 0)) return "";
  if (octets >= 1_000_000) return `${Math.round(octets / 1_000_000)} Mo`;
  return `${Math.max(1, Math.round(octets / 1000))} Ko`;
}

/** Pourcentage entier (0-100) d'un téléchargement ; 0 tant que la taille totale est inconnue. */
export function pourcentage(recus: number, total: number): number {
  if (!(total > 0) || !(recus > 0)) return 0;
  return Math.min(100, Math.floor((recus / total) * 100));
}
