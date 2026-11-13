/**
 * Qui encaisse-t-on ? (13/11/2026) « tout » = tout ce qui reste ; sinon l'identifiant d'UNE personne du compte.
 *
 * Piège d'une table fraîchement créée : la personne naît sur l'appareil avec un identifiant LOCAL ; dès que la synchronisation passe, le serveur lui
 * donne son identifiant DÉFINITIF et le compte se recharge avec celui-ci. Une fenêtre d'encaissement ouverte entre-temps (« payer maintenant, il reste »)
 * gardait l'ancien identifiant : elle n'affichait plus ni nom ni montant, et « Confirmer » ne faisait rien. On retrouve alors la personne par son nom.
 */
export interface PersonneAEncaisser {
  id: string;
  nom: string;
}

/** `memo` : identifiant et nom de la personne au moment où la fenêtre s'est ouverte. Plusieurs personnes de même nom : on ne devine pas (aucune). */
export function personnesAEncaisser<T extends PersonneAEncaisser>(aRegler: T[], cible: string, memo: PersonneAEncaisser | null): T[] {
  if (cible === "tout") return aRegler;
  const directe = aRegler.filter((p) => p.id === cible);
  if (directe.length > 0 || !memo || memo.id !== cible) return directe;
  const memeNom = aRegler.filter((p) => p.nom === memo.nom);
  return memeNom.length === 1 ? memeNom : [];
}
