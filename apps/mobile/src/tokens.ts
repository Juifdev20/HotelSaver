/**
 * Jetons de la charte graphique, portés en constantes RN (pas de CSS ici —
 * voir DECISIONS.md). Valeurs alignées sur `packages/ui/src/tokens.css`
 * (palette navy/bleu du 24/09/2026) : les deux doivent rester synchronisés
 * à la main si la charte change, `packages/ui` n'étant pas utilisable tel
 * quel dans React Native (composants web/CSS, pas de StyleSheet RN).
 */
export const couleurs = {
  navy: "#0F2742",
  navyForte: "#0A1A2E",
  bleu: "#1769E0",
  bleuHover: "#1258C0",
  bleuClair: "#EAF3FF",

  surface100: "#F6F8FC",
  surface200: "#FFFFFF",
  surface300: "#F9FBFE",
  bordure: "#E4EAF2",

  encre: "#142033",
  encreAttenuee: "#5F6B7E",
  // Contraste WCAG ≥ 4,5:1 sur blanc ET sur les fonds clairs (« Clair ») : ces teintes servent de TEXTE et de fond de
  // bouton à texte blanc. Les teintes d'origine, trop pâles pour du texte (2,3 à 3,8:1), sont gardées sous le
  // suffixe « Vif » pour les fonds, points, icônes et graphiques.
  encreFaible: "#5F6B7E",

  succes: "#0B7A48",
  succesVif: "#12B76A",
  succesClair: "#ECFDF3",
  alerte: "#A85A00",
  alerteVive: "#F79009",
  alerteClair: "#FFFAEB",
  danger: "#C0281D",
  dangerVif: "#F04438",
  dangerClair: "#FEF3F2",
  info: "#1565C0",
  infoVif: "#2E90FA",
  infoClair: "#EFF8FF",
  violet: "#6941C6",
  violetVif: "#7F56D9",
  violetClair: "#F4F3FF",
  neutre: "#5F6B7E",
} as const;

export const espacements = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 24,
  s6: 32,
  s7: 48,
} as const;

export const rayons = {
  sm: 8,
  md: 10,
  lg: 16,
  pill: 999,
} as const;
