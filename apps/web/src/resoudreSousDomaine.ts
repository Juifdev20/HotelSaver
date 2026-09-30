/**
 * Résolution de tenant côté client (Phase 9, étendu Phase 13) : ce site
 * détermine lui-même son nom d'hôte et le transmet explicitement à chaque
 * appel — le backend ne fait confiance à aucun en-tête Host.
 *
 * Le nom d'hôte complet est transmis tel quel (pas seulement le premier
 * label) : `PublicService.resoudreHotel` (apps/api) essaie successivement un
 * domaine personnalisé complet (`www.hotel-chicago.com`, Phase 13), le nom
 * d'hôte complet comme sous-domaine HotelSaver, puis son premier label
 * (`chicago.hotelsaver.com`/`chicago.localhost` → `chicago`) — ce fichier
 * n'a donc pas besoin de connaître le domaine de base final de la
 * plateforme (toujours pas choisi, voir DECISIONS.md Phase 9) pour
 * distinguer les deux cas. En développement, `n'importe-quoi.localhost`
 * résout nativement vers 127.0.0.1 (RFC 6761, aucune configuration DNS
 * nécessaire). `?hotel=` reste un secours explicite (pratique pour
 * re-tester plusieurs hôtels sans changer d'URL).
 *
 * Si l'hôte ressemble à un tenant mais que l'API répond 404 (ex. le domaine
 * de la vitrine HotelSaver elle-même), App.tsx retombe sur la vitrine.
 */
export function resoudreSousDomaine(): string | null {
  const parSecours = parametreHotel();
  if (parSecours) return parSecours;

  const hote = window.location.hostname;
  const labels = hote.split(".");

  // "localhost" seul (pas de sous-domaine), ou une adresse IP (127.0.0.1) :
  // pas de tenant résolvable, ?hotel= est alors le seul moyen de tester.
  const estAdresseIp = labels.every((label) => /^\d+$/.test(label));
  if (labels.length < 2 || estAdresseIp) return null;

  return hote;
}

/** Valeur de `?hotel=` si présente (mode secours / tests). */
export function parametreHotel(): string | null {
  return new URLSearchParams(window.location.search).get("hotel");
}

/** Chemin interne du site d'un hôtel. En mode `?hotel=`, le paramètre doit
 * suivre chaque lien : sinon un rechargement de page perdrait l'hôtel. */
export function cheminHotel(chemin: string): string {
  const hotel = parametreHotel();
  if (!hotel) return chemin;
  const separateur = chemin.includes("?") ? "&" : "?";
  return `${chemin}${separateur}hotel=${encodeURIComponent(hotel)}`;
}
