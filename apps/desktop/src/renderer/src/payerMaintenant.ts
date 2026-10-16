/**
 * « Payer mon abonnement maintenant » choisi à l'inscription : l'application s'en souvient jusqu'à la première connexion du patron (qui peut
 * attendre la confirmation de son adresse e-mail), puis ouvre l'écran Abonnement UNE fois. Simple repère local : sans importance pour la
 * sécurité (le serveur décide de tout), et perdre ce repère ne fait que ne pas ouvrir l'écran.
 */
const CLE = "hotelsaver.payerMaintenant";

export function memoriserPayerMaintenant(): void {
  try {
    localStorage.setItem(CLE, "1");
  } catch {
    // Stockage indisponible : le patron trouvera « Abonnement » dans le menu.
  }
}

/** Vrai UNE seule fois après le choix « payer maintenant » (le repère est effacé en le lisant). */
export function consommerPayerMaintenant(): boolean {
  try {
    if (localStorage.getItem(CLE) !== "1") return false;
    localStorage.removeItem(CLE);
    return true;
  } catch {
    return false;
  }
}
