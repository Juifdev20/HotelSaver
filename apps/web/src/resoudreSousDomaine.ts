/**
 * Résolution de tenant côté client (Phase 9, voir DECISIONS.md) : ce site
 * détermine lui-même son sous-domaine et le transmet explicitement à
 * chaque appel — le backend ne fait confiance à aucun en-tête Host.
 *
 * En production, un vrai sous-domaine (`hotel-chicago.hotelsaver.com` —
 * domaine final à définir, hors scope de cette phase) : premier label du
 * nom d'hôte. En développement, `n'importe-quoi.localhost` résout nativement
 * vers 127.0.0.1 (RFC 6761, aucune configuration DNS nécessaire) — même
 * logique. `?hotel=` reste un secours explicite (pratique pour re-tester
 * plusieurs hôtels sans changer d'URL).
 */
export function resoudreSousDomaine(): string | null {
  const parametres = new URLSearchParams(window.location.search);
  const parSecours = parametres.get("hotel");
  if (parSecours) return parSecours;

  const hote = window.location.hostname;
  const labels = hote.split(".");

  // "localhost" seul (pas de sous-domaine), ou une adresse IP (127.0.0.1) :
  // pas de tenant résolvable, ?hotel= est alors le seul moyen de tester.
  const estAdresseIp = labels.every((label) => /^\d+$/.test(label));
  if (labels.length < 2 || estAdresseIp) return null;

  return labels[0];
}
