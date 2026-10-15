/**
 * Un lien venu de l'extérieur (configuration, réponse du serveur) n'est suivi que s'il est en https : jamais de `javascript:`,
 * `data:` ni `http:` dans un href ou une redirection. Renvoie l'adresse normalisée, ou null.
 */
export function lienHttps(valeur: string | null | undefined): string | null {
  if (!valeur) return null;
  try {
    const url = new URL(valeur.trim());
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
