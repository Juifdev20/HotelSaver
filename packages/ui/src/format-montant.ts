import { Devise } from "@hotel-chicago/types";

/**
 * Section 12.5 : utilitaire partagé, seul point qui formate un montant dans
 * toute l'interface — RoomCard, OrderLine, DashboardStat ne doivent jamais
 * formater "à la main". Retourne exactement "45.00 $" (USD, toujours 2
 * décimales) ou "20 000 FC" (CDF, jamais de décimales, espace comme séparateur
 * de milliers, jamais de symbole $ — section 9.4/11.3).
 *
 * Séparateur de milliers implémenté à la main plutôt que via
 * `toLocaleString` : ce dernier peut produire une espace insécable fine
 * (U+202F) selon la version d'ICU du moteur JS, un caractère invisible à
 * l'œil mais différent d'une espace normale — mauvais pour un ticket
 * thermique (section 11) qui doit rester un texte ASCII simple et prévisible.
 */
export function formatMontant(montant: number | string, devise: Devise): string {
  const valeur = typeof montant === "string" ? Number(montant) : montant;

  if (Number.isNaN(valeur)) {
    throw new Error(`formatMontant: montant invalide (${JSON.stringify(montant)}).`);
  }

  if (devise === Devise.CDF) {
    return `${separerMilliers(Math.round(valeur))} FC`;
  }

  return `${valeur.toFixed(2)} $`;
}

function separerMilliers(entier: number): string {
  const signe = entier < 0 ? "-" : "";
  const chiffres = Math.abs(entier).toString();
  const groupes: string[] = [];
  for (let fin = chiffres.length; fin > 0; fin -= 3) {
    groupes.unshift(chiffres.slice(Math.max(0, fin - 3), fin));
  }
  return signe + groupes.join(" ");
}
