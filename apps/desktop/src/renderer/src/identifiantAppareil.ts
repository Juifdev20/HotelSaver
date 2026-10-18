/**
 * Identifiant aléatoire de cet ordinateur (18/10/2026), envoyé à l'inscription d'un hôtel (en-tête X-Appareil) : la limite
 * d'inscriptions par jour vaut ainsi par appareil, pas seulement par adresse internet. Aucune donnée personnelle — juste un tirage
 * gardé dans le stockage local. Indisponible (stockage bloqué) : null, l'inscription se fait quand même (limite par adresse seule).
 */
const CLE = "hotelsaver:identifiant-appareil";

export function identifiantAppareil(): string | null {
  try {
    let id = localStorage.getItem(CLE);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(CLE, id);
    }
    return id;
  } catch {
    return null;
  }
}
