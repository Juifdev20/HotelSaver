/**
 * Densité d'affichage : « confortable » (par défaut) ou « compacte » (lignes de tableau et espacements réduits, pour voir plus de lignes
 * sur un petit écran). Le choix est gardé sur le poste et appliqué à l'ouverture de la fenêtre (attribut `data-densite` sur <html>).
 */
const CLE = "hotel-chicago:densite";

export type Densite = "confortable" | "compacte";

export function densiteEnregistree(): Densite {
  try {
    return localStorage.getItem(CLE) === "compacte" ? "compacte" : "confortable";
  } catch {
    return "confortable";
  }
}

export function appliquerDensite(densite: Densite): void {
  document.documentElement.dataset.densite = densite;
  try {
    localStorage.setItem(CLE, densite);
  } catch {
    // Stockage indisponible : le choix vaut pour la session en cours seulement.
  }
}

export function installerDensite(): void {
  document.documentElement.dataset.densite = densiteEnregistree();
}
