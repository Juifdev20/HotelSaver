import { Devise } from "@hotel-chicago/types";

/**
 * Copie volontaire de `packages/ui/src/format-montant.ts` (même logique,
 * mêmes règles — section 9.4/11.3) : ce paquet-là importe des fichiers .css
 * en effet de bord (`import "./button.css"` etc.), ce que Metro ne sait pas
 * charger côté React Native. Dupliquer cette seule fonction pure est plus
 * simple et plus fiable que d'essayer de faire cohabiter deux bundlers sur
 * un même paquet. Si la règle de formatage change, mettre à jour les DEUX
 * copies.
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
