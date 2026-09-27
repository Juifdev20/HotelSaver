/**
 * Table de correspondance entre les clés de `palette.light` (françaises
 * courtes : bleu, navy, succes… — voir apps/api/src/common/palette-defaut.ts)
 * et les variables CSS de packages/ui/src/tokens.css (anglaises : --hc-blue,
 * --hc-navy, --hc-success…) — les noms ne correspondent pas littéralement,
 * une table est nécessaire, pas un simple préfixage (Phase 11).
 *
 * Seul le thème clair est géré : apps/web n'a aujourd'hui aucune bascule
 * clair/sombre nulle part (voir DECISIONS.md).
 */
const CLE_VERS_VARIABLE_CSS: Record<string, string> = {
  navy: "--hc-navy",
  navyForte: "--hc-navy-strong",
  bleu: "--hc-blue",
  bleuHover: "--hc-blue-hover",
  bleuClair: "--hc-blue-light",
  bleuTresClair: "--hc-blue-very-light",
  surface100: "--hc-surface-100",
  surface200: "--hc-surface-200",
  surface300: "--hc-surface-300",
  bordure: "--hc-border",
  encre: "--hc-ink",
  encreAttenuee: "--hc-ink-muted",
  encreFaible: "--hc-ink-faint",
  surAccent: "--hc-on-accent",
  succes: "--hc-success",
  succesClair: "--hc-success-light",
  alerte: "--hc-warning",
  alerteClair: "--hc-warning-light",
  danger: "--hc-danger",
  dangerClair: "--hc-danger-light",
  info: "--hc-info",
  infoClair: "--hc-info-light",
  violet: "--hc-purple",
  violetClair: "--hc-purple-light",
  neutre: "--hc-neutral",
  surStatut: "--hc-on-status",
  iconeSombre: "--hc-icone-sombre",
};

/** Ne lève jamais : une palette absente/mal formée (ex. hôtel sans branding,
 * ou appel échoué) laisse simplement le thème générique de packages/ui en
 * place — jamais un blocage de page pour une erreur d'affichage. */
export function appliquerPalette(palette: unknown): void {
  if (!palette || typeof palette !== "object" || !("light" in palette)) return;
  const light = (palette as { light?: unknown }).light;
  if (!light || typeof light !== "object") return;

  for (const [cle, valeur] of Object.entries(light as Record<string, unknown>)) {
    const variable = CLE_VERS_VARIABLE_CSS[cle];
    if (variable && typeof valeur === "string") {
      document.documentElement.style.setProperty(variable, valeur);
    }
  }
}
