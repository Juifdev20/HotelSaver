/**
 * Mode sombre (11/11/2026) : règles PURES de recoloration, partagées et testables. L'application mobile écrit ses couleurs « en clair » ; en mode
 * sombre, chaque couleur claire est traduite selon son RÔLE : un fond clair devient un fond sombre, un texte foncé devient un texte clair, une
 * couleur franche (bouton bleu, pastille rouge…) reste telle quelle (le texte blanc dessus garde son contraste). Les teintes de la charte ont une
 * table précise ; toute autre couleur est traduite par un calcul de luminosité (même teinte) : rien ne reste « blanc sur blanc ».
 * La traduction est idempotente : traduire une couleur déjà sombre ne la change pas.
 */

function normaliser(couleur: string): string | null {
  const c = couleur.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(c)) return c;
  const m = /^#([0-9A-F])([0-9A-F])([0-9A-F])$/.exec(c);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : null;
}

function versRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function versHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  h /= 6;
  return [h, s, l];
}

function depuisHsl(h: number, s: number, l: number): string {
  const f = (p: number, q: number, t0: number) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r = l;
  let g = l;
  let b = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = f(p, q, h + 1 / 3);
    g = f(p, q, h);
    b = f(p, q, h - 1 / 3);
  }
  const hex = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

/** Fonds et bordures : couleur claire de la charte → son équivalent sombre. */
export const TABLE_FOND_SOMBRE: Readonly<Record<string, string>> = {
  "#F6F8FC": "#0E1624", // fond de page
  "#FFFFFF": "#172236", // cartes
  "#F9FBFE": "#121C2D", // surface secondaire
  "#E4EAF2": "#2A3850", // bordures
  "#EAF3FF": "#15305A", // bleu clair
  "#ECFDF3": "#0F3326", // succès clair
  "#FFFAEB": "#3A2A0B", // alerte claire
  "#FEF3F2": "#3D1815", // danger clair
  "#F4F3FF": "#2A2050", // violet clair
  "#EFF8FF": "#12304F", // info clair
};

/** Textes : couleur foncée de la charte → son équivalent clair (contraste ≥ 4,5:1 sur les fonds sombres). */
export const TABLE_TEXTE_SOMBRE: Readonly<Record<string, string>> = {
  "#142033": "#E8EEF8", // encre
  "#0F2742": "#E8EEF8", // navy
  "#5F6B7E": "#9AA8BF", // encre atténuée / faible / neutre
  "#1769E0": "#6BA3FF", // bleu
  "#0B7A48": "#4ADE99", // succès
  "#A85A00": "#FBB040", // alerte
  "#C0281D": "#FF8A80", // danger
  "#B42318": "#FF8A80", // danger (variante)
  "#1565C0": "#6BB0FF", // info
  "#6941C6": "#B7A1FF", // violet
};

/** Fond/bordure en mode sombre. Les couleurs franches ou déjà sombres, les rgba, `transparent` et les noms restent inchangés. */
export function fondSombre(couleur: string): string {
  const hex = normaliser(couleur);
  if (!hex) return couleur;
  const connue = TABLE_FOND_SOMBRE[hex];
  if (connue) return connue;
  const [h, s, l] = versHsl(versRgb(hex));
  if (l <= 0.55) return couleur; // franche ou déjà sombre
  return depuisHsl(h, s * 0.8, 0.09 + (1 - l) * 0.5);
}

/** Texte en mode sombre. Le blanc, les textes déjà clairs, les rgba et les noms restent inchangés. */
export function texteSombre(couleur: string): string {
  const hex = normaliser(couleur);
  if (!hex) return couleur;
  const connue = TABLE_TEXTE_SOMBRE[hex];
  if (connue) return connue;
  const [h, s, l] = versHsl(versRgb(hex));
  if (l >= 0.5) return couleur;
  return depuisHsl(h, s, 0.93 - 0.55 * l);
}

const CLES_TEXTE = new Set(["color", "textDecorationColor", "textShadowColor"]);
const CLES_FOND = new Set([
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderRightColor",
  "borderStartColor",
  "borderEndColor",
  "overlayColor",
]);

/** Traduit les couleurs d'un style plat (texte → `texteSombre`, fond et bordures → `fondSombre`). Le reste du style est copié tel quel. */
export function styleSombre<T extends Record<string, unknown>>(style: T): T {
  let copie: Record<string, unknown> | null = null;
  for (const cle of Object.keys(style)) {
    const valeur = style[cle];
    if (typeof valeur !== "string") continue;
    const traduit = CLES_TEXTE.has(cle) ? texteSombre(valeur) : CLES_FOND.has(cle) ? fondSombre(valeur) : valeur;
    if (traduit !== valeur) {
      copie ??= { ...style };
      copie[cle] = traduit;
    }
  }
  return (copie ?? style) as T;
}

const inverse = (table: Readonly<Record<string, string>>): Record<string, string> => {
  const r: Record<string, string> = {};
  for (const [clair, sombre] of Object.entries(table)) r[sombre] ??= clair; // une seule traduction par teinte sombre : la première (la charte avant les variantes)
  return r;
};
const FOND_VERS_CLAIR = inverse(TABLE_FOND_SOMBRE);
const TEXTE_VERS_CLAIR = inverse(TABLE_TEXTE_SOMBRE);

/**
 * L'inverse de `styleSombre` pour les teintes de la charte : un style écrit APRÈS un passage en mode sombre (module chargé tardivement) a pu lire des
 * couleurs déjà sombres ; en mode clair on les remet en clair, sinon elles resteraient sombres pour de bon.
 */
export function styleClair<T extends Record<string, unknown>>(style: T): T {
  let copie: Record<string, unknown> | null = null;
  for (const cle of Object.keys(style)) {
    const valeur = style[cle];
    if (typeof valeur !== "string") continue;
    const hex = normaliser(valeur);
    if (!hex) continue;
    const clair = CLES_TEXTE.has(cle) ? TEXTE_VERS_CLAIR[hex] : CLES_FOND.has(cle) ? FOND_VERS_CLAIR[hex] : undefined;
    if (clair && clair !== valeur) {
      copie ??= { ...style };
      copie[cle] = clair;
    }
  }
  return (copie ?? style) as T;
}

export type PreferenceApparence = "auto" | "clair" | "sombre";
export type SchemaCouleurs = "clair" | "sombre";

/** Le schéma réellement affiché : le choix de l'utilisateur, ou celui du téléphone quand il a laissé « Auto ». */
export function schemaEffectif(preference: PreferenceApparence | null | undefined, systeme: string | null | undefined): SchemaCouleurs {
  if (preference === "sombre") return "sombre";
  if (preference === "clair") return "clair";
  return systeme === "dark" ? "sombre" : "clair";
}

export function preferenceValide(valeur: unknown): PreferenceApparence {
  return valeur === "clair" || valeur === "sombre" ? valeur : "auto";
}
