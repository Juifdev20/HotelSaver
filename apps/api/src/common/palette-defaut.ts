/**
 * Charte graphique générique posée sur tout nouvel hôtel onboardé
 * manuellement (POST /super-admin/hotels) — JAMAIS celle d'Hôtel Chicago,
 * qui est sa propre marque. Gabarit neutre gris/bleu, même structure JSON
 * que celle définie en Phase 1 (light/dark/espacements/rayons), en
 * attendant une personnalisation manuelle ou la génération automatique
 * depuis un logo (node-vibrant, hors scope — phase d'inscription en
 * libre-service). Voir DECISIONS.md, Phase 3.
 */
export const PALETTE_DEFAUT = {
  light: {
    navy: "#1F2937",
    navyForte: "#111827",
    bleu: "#2563EB",
    bleuHover: "#1D4ED8",
    bleuClair: "#EFF6FF",
    bleuTresClair: "#F8FAFC",
    surface100: "#F8FAFC",
    surface200: "#FFFFFF",
    surface300: "#F1F5F9",
    bordure: "#E2E8F0",
    encre: "#1E293B",
    encreAttenuee: "#64748B",
    encreFaible: "#94A3B8",
    surAccent: "#FFFFFF",
    succes: "#16A34A",
    succesClair: "#F0FDF4",
    alerte: "#D97706",
    alerteClair: "#FFFBEB",
    danger: "#DC2626",
    dangerClair: "#FEF2F2",
    info: "#0284C7",
    infoClair: "#F0F9FF",
    violet: "#7C3AED",
    violetClair: "#F5F3FF",
    neutre: "#64748B",
    surStatut: "#FFFFFF",
    iconeSombre: "#334155",
  },
  dark: {
    surface100: "#0F172A",
    surface200: "#1E293B",
    surface300: "#111827",
    bordure: "#334155",
    encre: "#F8FAFC",
    encreAttenuee: "#94A3B8",
    encreFaible: "#64748B",
    bleu: "#3B82F6",
    bleuHover: "#60A5FA",
    bleuClair: "#1E3A5F",
    bleuTresClair: "#111827",
    succesClair: "#0F2A1A",
    alerteClair: "#2E2410",
    dangerClair: "#2E1615",
    infoClair: "#0D2338",
    violetClair: "#221A3A",
  },
  espacements: { s1: 4, s2: 8, s3: 12, s4: 16, s5: 24, s6: 32, s7: 48 },
  rayons: { sm: 8, md: 10, lg: 16, pill: 999 },
};
